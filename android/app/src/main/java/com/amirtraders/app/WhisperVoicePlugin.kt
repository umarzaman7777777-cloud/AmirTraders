package com.amirtraders.app

import android.Manifest
import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
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
import java.net.HttpURLConnection
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
// REWRITE (2026-09-06, user question: "what about the 139MB download on
// mobile data, and its updates?"). The original downloadModel used a
// fixed timeout on the JS side and no network-type awareness at all —
// on real mobile data (not WiFi, as the user clarified they're actually
// testing on), a 139MB download can genuinely take several minutes, so a
// short timeout would kill a perfectly good, still-in-progress download
// and report it as failed. That's very likely the actual reason the mic
// looked broken. This version: checks WiFi vs mobile data before
// downloading and requires explicit opt-in for mobile data given the
// data cost, reports real progress via a downloadProgress event instead
// of relying on any timeout, resumes a partial download instead of
// restarting from zero if interrupted, and exposes a lightweight
// (HEAD-request only, no body download) update check so a future model
// revision doesn't mean silently re-downloading 139MB.
//
// HONEST LIMITATION, unchanged from before: this plugin's actual
// transcription accuracy, and now this download logic too, has not been
// verified against a real network/device from this sandbox — there is
// no way to download the real model file here (this sandbox's network
// cannot reach Hugging Face at all, confirmed) and no way to simulate a
// real mobile-data connection's exact behavior. This code is careful,
// follows documented Android APIs, and is syntax-reviewed as closely as
// possible without a live device — but the real first test is still the
// built app, on a real phone, on real mobile data.
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
        // ADD (2026-09-08, user report: "listening interval too much, it
        // doesn't get and react" — the mic always recorded for the full
        // fixed window no matter how quickly the person actually finished
        // speaking, feeling slow/unresponsive before processing could even
        // start). Simple amplitude-based voice-activity detection: once
        // real speech has been heard, stop recording early after a short
        // period of genuine silence, rather than always waiting out the
        // full MAX_RECORD_SECONDS regardless of what's actually happening.
        // MIN_RECORD_SECONDS guards against stopping instantly during the
        // natural brief pause before someone starts speaking — early-stop
        // is only even considered once this much time has passed.
        private const val MIN_RECORD_SECONDS = 1.0
        // Silence held continuously for this long, AFTER speech was heard,
        // is treated as "done talking" — short enough to feel responsive,
        // long enough not to cut off a person\u0027s natural mid-sentence pause.
        private const val SILENCE_STOP_SECONDS = 1.2
        // 16-bit PCM samples range \u00b132767; genuine speech is typically
        // several thousand in amplitude, normal background/room noise is
        // usually well under this \u2014 conservative enough to avoid a quiet
        // room falsely registering as "speech detected".
        private const val SPEECH_AMPLITUDE_THRESHOLD = 800
        // How often a progress event is emitted at minimum — every 1%,
        // not on every single buffer read, so a fast WiFi download
        // doesn't flood the JS bridge with hundreds of events per second.
        private const val PROGRESS_STEP_PERCENT = 1
    }

    private var whisperContext: WhisperContext? = null
    private val pluginScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    @Volatile private var isRecording = false
    @Volatile private var downloadCancelled = false

    private fun modelFile(): File = File(context.filesDir, MODEL_FILENAME)
    private fun partialFile(): File = File(context.filesDir, "$MODEL_FILENAME.part")
    // Stores the remote file's ETag (or Last-Modified as a fallback, for
    // servers that don't send one) from the last completed download —
    // compared against on checkForUpdate to detect a real revision
    // without downloading the file itself.
    private fun modelMetaFile(): File = File(context.filesDir, "$MODEL_FILENAME.meta")

    private fun isWifiConnected(): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
    }

    private fun hasAnyConnection(): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

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

    // ADD (2026-09-06): lets the JS side know which kind of connection is
    // active before deciding whether to download (or ask first) at all —
    // separate from downloadModel itself so the JS side can show its own
    // "download over mobile data?" confirmation UI before ever calling it.
    @PluginMethod
    fun getNetworkStatus(call: PluginCall) {
        val ret = JSObject()
        ret.put("isWifi", isWifiConnected())
        ret.put("hasConnection", hasAnyConnection())
        call.resolve(ret)
    }

    // ADD (2026-09-06): a lightweight (HEAD request only, no file body)
    // check for whether the model on the server has changed since the
    // last completed download. Safe to call often — costs almost nothing
    // — the actual 139MB re-download only ever happens if this reports
    // true AND the JS side then explicitly calls downloadModel again,
    // going through the exact same WiFi/mobile-data rules as the first
    // download.
    @PluginMethod
    fun checkForUpdate(call: PluginCall) {
        if (!modelFile().exists() || modelFile().length() == 0L) {
            // Nothing downloaded yet — this isn't an "update" question,
            // it's a first-download question, which isModelReady/
            // downloadModel already handle.
            val ret = JSObject()
            ret.put("updateAvailable", false)
            ret.put("reason", "no-model-yet")
            call.resolve(ret)
            return
        }
        if (!hasAnyConnection()) {
            call.reject("no-connection")
            return
        }
        pluginScope.launch {
            var conn: HttpURLConnection? = null
            try {
                conn = (URL(MODEL_URL).openConnection() as HttpURLConnection).apply {
                    requestMethod = "HEAD"
                    connectTimeout = 15000
                    readTimeout = 15000
                    connect()
                }
                val remoteTag = conn.getHeaderField("ETag") ?: conn.getHeaderField("Last-Modified") ?: ""
                val remoteSize = conn.contentLengthLong
                val storedTag = if (modelMetaFile().exists()) modelMetaFile().readText().trim() else ""
                val ret = JSObject()
                // Only reports an update as available when there's an
                // actual, comparable tag on both sides and they differ —
                // never guesses "yes" just because nothing was stored
                // before (e.g. an app update from before this metadata
                // tracking existed at all).
                ret.put("updateAvailable", remoteTag.isNotEmpty() && storedTag.isNotEmpty() && remoteTag != storedTag)
                ret.put("sizeBytes", remoteSize)
                withContext(Dispatchers.Main) { call.resolve(ret) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { call.reject("update-check-failed: " + (e.message ?: e.toString())) }
            } finally {
                conn?.disconnect()
            }
        }
    }

    // REWRITE (2026-09-06): now checks connection type first (mobile data
    // requires explicit allowMobileData=true from the JS side, given the
    // real data cost of 139MB), reports live progress via a
    // "downloadProgress" event instead of the caller having to guess how
    // long is too long, and resumes a partial download via an HTTP Range
    // request instead of restarting from zero if a previous attempt was
    // interrupted — which matters more on mobile data, where a dropped
    // connection is more common than on WiFi.
    @PluginMethod
    fun downloadModel(call: PluginCall) {
        val allowMobileData = call.getBoolean("allowMobileData", false) ?: false
        if (!hasAnyConnection()) {
            call.reject("no-connection")
            return
        }
        if (!isWifiConnected() && !allowMobileData) {
            call.reject("wifi-required")
            return
        }
        val file = modelFile()
        if (file.exists() && file.length() > 0) {
            call.resolve()
            return
        }
        downloadCancelled = false
        pluginScope.launch {
            var conn: HttpURLConnection? = null
            try {
                val tmp = partialFile()
                val existingBytes = if (tmp.exists()) tmp.length() else 0L

                conn = (URL(MODEL_URL).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 30000
                    readTimeout = 30000
                    if (existingBytes > 0) setRequestProperty("Range", "bytes=$existingBytes-")
                    connect()
                }

                // Not every server honors Range — if it comes back 200
                // (full content) instead of 206 (partial content) despite
                // asking to resume, that partial file can't be trusted as
                // a genuine prefix of the same content, so start over
                // rather than risk silently corrupting the model with a
                // mismatched resume.
                val resumed = conn.responseCode == HttpURLConnection.HTTP_PARTIAL
                val startByte = if (resumed) existingBytes else 0L
                if (!resumed && existingBytes > 0) tmp.delete()

                val totalBytes = startByte + conn.contentLengthLong
                var downloaded = startByte
                var lastReportedPercent = -1

                conn.inputStream.use { input ->
                    FileOutputStream(tmp, resumed && existingBytes > 0).use { output ->
                        val buffer = ByteArray(1 shl 16)
                        while (!downloadCancelled) {
                            val n = input.read(buffer)
                            if (n <= 0) break
                            output.write(buffer, 0, n)
                            downloaded += n
                            if (totalBytes > 0) {
                                val percent = ((downloaded * 100) / totalBytes).toInt()
                                if (percent >= lastReportedPercent + PROGRESS_STEP_PERCENT || percent == 100) {
                                    lastReportedPercent = percent
                                    notifyListeners("downloadProgress", JSObject().apply {
                                        put("percent", percent)
                                        put("bytesDownloaded", downloaded)
                                        put("totalBytes", totalBytes)
                                    })
                                }
                            }
                        }
                    }
                }

                if (downloadCancelled) {
                    withContext(Dispatchers.Main) { call.reject("download-cancelled") }
                    return@launch
                }

                // ETag captured BEFORE disconnect() — some connection
                // implementations invalidate header access once closed.
                val tag = conn.getHeaderField("ETag") ?: conn.getHeaderField("Last-Modified") ?: ""

                if (!tmp.renameTo(file)) {
                    throw java.io.IOException("Could not finalize downloaded model file")
                }
                if (tag.isNotEmpty()) modelMetaFile().writeText(tag)

                withContext(Dispatchers.Main) { call.resolve() }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { call.reject("download-failed: " + (e.message ?: e.toString())) }
            } finally {
                conn?.disconnect()
            }
        }
    }

    // ADD (2026-09-06): lets the JS side offer a real Cancel button during
    // a long mobile-data download rather than the only way out being
    // force-closing the app. The partial file is left in place
    // deliberately — the next downloadModel call resumes from here
    // instead of losing that progress.
    @PluginMethod
    fun cancelDownload(call: PluginCall) {
        downloadCancelled = true
        call.resolve()
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
        val minSamplesBeforeEarlyStop = (SAMPLE_RATE * MIN_RECORD_SECONDS).toInt()
        val silenceSamplesToStop = (SAMPLE_RATE * SILENCE_STOP_SECONDS).toInt()
        val buffer = ShortArray(maxSamples)
        var samplesRead = 0
        var hasDetectedSpeech = false
        var silentSamplesInARow = 0
        isRecording = true
        record.startRecording()
        try {
            while (isRecording && samplesRead < maxSamples) {
                val toRead = minOf(minBufSize, maxSamples - samplesRead)
                val n = record.read(buffer, samplesRead, toRead)
                if (n <= 0) break
                // Peak absolute amplitude of just this chunk — cheap and
                // sufficient for a simple loud/quiet decision, no need for
                // a full RMS calculation for this purpose.
                var chunkPeak = 0
                for (i in samplesRead until samplesRead + n) {
                    val abs = kotlin.math.abs(buffer[i].toInt())
                    if (abs > chunkPeak) chunkPeak = abs
                }
                samplesRead += n
                if (chunkPeak >= SPEECH_AMPLITUDE_THRESHOLD) {
                    hasDetectedSpeech = true
                    silentSamplesInARow = 0
                } else {
                    silentSamplesInARow += n
                }
                if (hasDetectedSpeech && samplesRead >= minSamplesBeforeEarlyStop && silentSamplesInARow >= silenceSamplesToStop) {
                    break
                }
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
