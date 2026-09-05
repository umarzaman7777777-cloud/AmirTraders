package com.amirtraders.app

import android.Manifest
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.whispercpp.whisper.WhisperContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.URL

// ADD (2026-09-05, user request: "hands-on" whisper.cpp integration for
// offline Roman-Urdu voice recognition, after Android's own on-device
// recognizer was confirmed too inaccurate on Urdu — see the chat history
// for the research and the user's own test report: "records but shows
// wrong/garbled text"). Bridges the whisper-lib module (built from the
// official ggml-org/whisper.cpp Android example — see whisper-lib/ and
// whispercpp-src/, chosen over any third-party prebuilt binary
// specifically so this native code stays inspectable) to this app's JS
// side, exposing an API shaped like @capacitor-community/speech-
// recognition's own start()/available() so the JS wiring change is small.
//
// IMPORTANT, per the model's own documentation: language must stay on
// auto-detect. Forcing the Urdu language token makes the model output
// Urdu script instead of the Roman/Latin script this app's voice command
// matching expects — see transcribeData's call site below.
//
// HONEST LIMITATION, stated directly to the user before this was built:
// this plugin's actual transcription accuracy has not been verified in
// this sandbox — there is no way to download the real model file (this
// sandbox's network cannot reach Hugging Face at all, confirmed) or to
// produce genuine Roman-Urdu speech to test against (no microphone here).
// This code is careful, follows the official example's own patterns, and
// is syntax-reviewed as closely as possible without a Kotlin compiler in
// this sandbox — but the real first test of whether it actually works is
// the built app, on a real device, with a real voice.
@CapacitorPlugin(
    name = "WhisperVoice",
    permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")]
)
class WhisperVoicePlugin : Plugin() {

    companion object {
        // The community fine-tune the user reviewed and asked to test
        // before any of this was built — see chat history for why this
        // specific model (Roman-Urdu dictation, not a generic multilingual
        // model) was chosen, and the accuracy research behind it.
        private const val MODEL_URL =
            "https://huggingface.co/femustafa/voicedictation-models/resolve/main/ggml-model-q4_0.bin"
        private const val MODEL_FILENAME = "ggml-model-roman-urdu-q4_0.bin"
        private const val SAMPLE_RATE = 16000
        // Matches transcribeOnline_'s own recording window in index.html —
        // this plugin captures raw audio directly (no built-in silence
        // detection, unlike Android's own SpeechRecognizer), so a fixed
        // window is the simplest correct starting point. A command that
        // finishes early just gets trailing silence, which whisper.cpp
        // handles fine; a future version could add real silence detection
        // to cut this short automatically.
        private const val MAX_RECORD_SECONDS = 8
    }

    private var whisperContext: WhisperContext? = null
    private val pluginScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    @Volatile private var isRecording = false

    private fun modelFile(): File = File(context.filesDir, MODEL_FILENAME)

    // Lets the JS side check, before showing any "listening" UI, whether
    // the model has actually finished downloading yet — so a first-run
    // download-in-progress state can be shown distinctly from a genuine
    // recognition failure.
    @PluginMethod
    fun isModelReady(call: PluginCall) {
        val ret = JSObject()
        ret.put("ready", modelFile().exists() && modelFile().length() > 0)
        call.resolve(ret)
    }

    // Downloads the model to this app's private files directory. Safe to
    // call repeatedly — a no-op once the file already exists. Runs off
    // the main thread; the JS side awaits this before the first mic use.
    @PluginMethod
    fun downloadModel(call: PluginCall) {
        pluginScope.launch {
            try {
                val file = modelFile()
                if (!file.exists() || file.length() == 0L) {
                    // Downloaded to a temp name first, only renamed to the
                    // real filename once the copy completes fully — so a
                    // connection drop mid-download can never leave a
                    // half-written file sitting at the name isModelReady()
                    // checks for, which would otherwise look like a valid,
                    // ready model on the next app open.
                    val tmp = File(context.filesDir, "$MODEL_FILENAME.part")
                    URL(MODEL_URL).openStream().use { input ->
                        FileOutputStream(tmp).use { output ->
                            input.copyTo(output, bufferSize = 1 shl 20)
                        }
                    }
                    if (!tmp.renameTo(file)) {
                        throw java.io.IOException("Could not finalize downloaded model file")
                    }
                }
                withContext(Dispatchers.Main) { call.resolve() }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { call.reject("download-failed: " + (e.message ?: e.toString())) }
            }
        }
    }

    // Shaped to match @capacitor-community/speech-recognition's own
    // start() result ({ matches: [...] }) so the existing JS call site
    // needs only a minimal change, not a rewrite of its result handling.
    @PluginMethod
    fun start(call: PluginCall) {
        if (!hasRequiredPermissions()) {
            requestPermissionForAlias("microphone", call, "micPermsCallback")
            return
        }
        beginTranscription(call)
    }

    @PermissionCallback
    private fun micPermsCallback(call: PluginCall) {
        if (hasRequiredPermissions()) {
            beginTranscription(call)
        } else {
            call.reject("permission-denied")
        }
    }

    private fun beginTranscription(call: PluginCall) {
        val file = modelFile()
        if (!file.exists() || file.length() == 0L) {
            call.reject("model-not-downloaded")
            return
        }
        if (isRecording) {
            call.reject("already-recording")
            return
        }
        pluginScope.launch {
            try {
                // Loaded once, reused across calls — reloading a ~139MB
                // model on every single mic tap would make each command
                // noticeably slower than it needs to be after the first.
                if (whisperContext == null) {
                    whisperContext = WhisperContext.createContextFromFile(file.absolutePath)
                }
                val audio = recordAudio()
                if (audio.isEmpty()) {
                    withContext(Dispatchers.Main) { call.reject("no-speech") }
                    return@launch
                }
                // printTimestamp = false: this app wants plain command
                // text, not a timestamped transcript.
                val text = whisperContext!!.transcribeData(audio, printTimestamp = false)
                val cleaned = text.trim()
                if (cleaned.isEmpty()) {
                    withContext(Dispatchers.Main) { call.reject("no-speech") }
                    return@launch
                }
                withContext(Dispatchers.Main) {
                    val ret = JSObject()
                    val arr = com.getcapacitor.JSArray()
                    arr.put(cleaned)
                    ret.put("matches", arr)
                    call.resolve(ret)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { call.reject("transcribe-failed: " + (e.message ?: e.toString())) }
            }
        }
    }

    // Captures raw microphone audio and converts it to the float32,
    // [-1, 1]-normalized, 16kHz mono format whisper.cpp's transcribeData
    // expects — matching the official whisper.android example's own
    // recording approach.
    private fun recordAudio(): FloatArray {
        val minBufSize = AudioRecord.getMinBufferSize(
            SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
        )
        val record = AudioRecord(
            MediaRecorder.AudioSource.MIC, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT, minBufSize * 4
        )
        val maxSamples = SAMPLE_RATE * MAX_RECORD_SECONDS
        val buffer = ShortArray(maxSamples)
        var samplesRead = 0
        isRecording = true
        record.startRecording()
        try {
            while (isRecording && samplesRead < maxSamples) {
                val toRead = minOf(minBufSize, maxSamples - samplesRead)
                val n = record.read(buffer, samplesRead, toRead)
                if (n > 0) samplesRead += n else break
            }
        } finally {
            isRecording = false
            record.stop()
            record.release()
        }
        return FloatArray(samplesRead) { i -> buffer[i] / 32768.0f }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        isRecording = false
        call.resolve()
    }

    // Matches @capacitor-community/speech-recognition's available() shape
    // ({ available: bool }) — always true here since this plugin's own
    // presence in the build means it's meant to be usable, unlike the
    // native OS recognizer which can genuinely be missing on some devices.
    @PluginMethod
    fun available(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", true)
        call.resolve(ret)
    }
}
