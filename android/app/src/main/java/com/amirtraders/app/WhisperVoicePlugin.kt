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
import com.whispercpp.whisper.RnnoiseDenoiser
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
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
        // REPLACED (2026-09-15, user request: "multilingual mic system
        // which can understand both mixed words so there is no need
        // [to] exchange languages and waste time... sometimes even in
        // Urdu we hit an English word"). The Roman-Urdu fine-tune this
        // used to point to (see prior history) was specifically
        // SPECIALIZED for accurate Roman-script Urdu output — exactly
        // that specialization is why it handled a whole sentence
        // switching languages mid-way poorly: a fine-tune narrowed for
        // one output style has less of the general multilingual
        // capability a broader model has. Confirmed directly with the
        // user this trade-off was understood and wanted before making
        // this change: this general multilingual model should handle
        // Urdu/English code-switching within a single sentence far
        // better, but may be somewhat less sharp on PURE Roman-Urdu
        // than the specialized fine-tune was. The now-redundant separate
        // English-only fallback model (added one request earlier, before
        // this one) is no longer used by default — a single multilingual
        // pass replaces the need for a second, separate attempt in a
        // different language entirely, which is the whole point of this
        // change.
        private data class ModelConfig(val url: String, val filename: String, val whisperLang: String)
        private val MODEL_CONFIGS = mapOf(
            "ur" to ModelConfig(
                // CHANGED (2026-09-15, user report: "why keep too much
                // time to understand and convert into text" — real cause
                // traced to the 190MB "small" model's inference time on
                // real phone hardware, not the recording step). Swapped
                // to ggerganov/whisper.cpp's official multilingual
                // "base" model, q5_1 quantized (~60MB) — a genuine
                // speed/accuracy trade-off, not a free win: base has a
                // real (published) higher word-error-rate than small on
                // general multilingual speech. Kept anyway as a live
                // trial because this app's voice commands are a narrow,
                // mostly-fixed vocabulary (view names, party names from
                // the user's own data, add/edit/delete/export/balance),
                // where a smaller model tends to do much better than its
                // raw benchmark score suggests. If accuracy on real
                // commands turns out worse than the speed gain is worth,
                // revert this url/filename pair to
                // ggml-small-q5_1.bin / ggml-model-multilingual-small-q5_1.bin
                // — nothing else in this file needs to change to roll
                // back. "auto" (unchanged) lets it follow whichever
                // language is actually being spoken, including switching
                // mid-utterance, rather than committing to one language
                // for the whole recording.
                url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin",
                filename = "ggml-model-multilingual-base-q5_1.bin",
                whisperLang = "auto"
            ),
            "en" to ModelConfig(
                url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin",
                filename = "ggml-model-base-en-q5_1.bin",
                whisperLang = "en"
            )
        )
        private fun modelConfig(lang: String) = MODEL_CONFIGS[lang] ?: MODEL_CONFIGS.getValue("ur")
        private const val SAMPLE_RATE = 16000
        // ADD (2026-09-15, user request: real noise cancellation). RNNoise
        // (see jni.c/LibWhisper.kt's RnnoiseDenoiser) operates on 48kHz
        // audio in fixed 480-sample frames — this is the rate audio is
        // actually CAPTURED at now; SAMPLE_RATE above stays the FINAL rate
        // handed to whisper.cpp, unchanged, via downsampling at the end of
        // recordAudio(). Also a nice side benefit even before denoising:
        // 48kHz is the native rate most Android mic hardware actually
        // runs at internally, so requesting it directly avoids one layer
        // of the OS's own resampling that a direct 16kHz request would
        // have gone through anyway.
        private const val CAPTURE_SAMPLE_RATE = 48000
        // Matches transcribeOnline_'s own recording window in index.html —
        // this plugin captures raw audio directly (no built-in silence
        // detection, unlike Android's own SpeechRecognizer), so a fixed
        // window is the simplest correct starting point. A command that
        // finishes early just gets trailing silence, which whisper.cpp
        // handles fine; a future version could add real silence detection
        // to cut this short automatically.
        private const val MAX_RECORD_SECONDS = 6
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
        private const val SILENCE_STOP_SECONDS = 0.9
        // 16-bit PCM samples range \u00b132767 (kept only as context for
        // RNNoise's own expected scale — see denoiseFrame's own notes).
        // FIX (2026-09-15, user request: real noise cancellation, and the
        // direct cause of "keeps recording too long in noisy places").
        // Everything below this point used to be a hand-built amplitude
        // heuristic (measure the room's noise floor, set a threshold
        // relative to it, require a sound to persist across chunks).
        // RNNoise's own VAD (voice-activity) output, returned by every
        // denoiseFrame() call, replaces all of that with something far
        // more robust: an actual trained classifier that has learned what
        // speech looks like versus what fan/road/machine noise looks
        // like, rather than just comparing loudness. A frame counts as
        // speech when its VAD probability crosses this threshold — 0.5 is
        // RNNoise's own natural midpoint for this.
        private const val VAD_SPEECH_THRESHOLD = 0.5f
        // How many consecutive above-threshold 10ms frames are needed
        // before a sound counts as resumed speech rather than a brief
        // noise transient (a passing truck, a machine cycling on/off) —
        // 2 frames (20ms) filters single-frame spikes while staying
        // responsive to someone genuinely still talking.
        private const val VAD_FRAMES_TO_COUNT_AS_SPEECH = 2
        // How often a progress event is emitted at minimum — every 1%,
        // not on every single buffer read, so a fast WiFi download
        // doesn't flood the JS bridge with hundreds of events per second.
        private const val PROGRESS_STEP_PERCENT = 1
        // FIX (2026-09-13): a genuinely well-formed model loads in a few
        // seconds even on modest hardware — this is generous headroom for
        // a slow phone while still being far short of the JS side's 60s
        // recognition timeout, so a hang gets caught and reported by THIS
        // layer (with a clear, specific reason) rather than silently
        // surfacing as just another generic "recognition-timed-out".
        // Bumped from 25s (2026-09-15): the multilingual model that
        // replaced the old Roman-Urdu one is ~190MB vs ~139MB before —
        // real, if modest, extra load time to allow for on slower
        // devices, still comfortably under the 60s ceiling.
        private const val MODEL_LOAD_TIMEOUT_MS = 30000L
    }

    private var whisperContext: WhisperContext? = null
    // ADD (2026-09-15): which language's model whisperContext currently
    // holds. Only ONE model is ever kept in memory at a time — a phone
    // that can only just about handle one ~60-140MB model comfortably
    // shouldn't be asked to hold two, so switching languages releases the
    // old context before loading the new one rather than keeping both.
    @Volatile private var loadedContextLang: String? = null
    private val pluginScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    @Volatile private var isRecording = false
    @Volatile private var downloadCancelled = false
    // ADD (2026-09-10, bug report: "voice box remains open, not processing
    // my voice"). Root cause: the JS side's own timeout was shorter than
    // record (up to 8s) + on-device inference could genuinely take on a
    // real phone, so it gave up and showed an error while this coroutine
    // kept running in the background — its eventual result/error was
    // silently dropped, and isRecording could be left stuck, causing the
    // *next* mic tap to fail with "already-recording" too. currentJob lets
    // stop() actually cancel the in-flight work instead of abandoning it;
    // activeCallToken lets a cancelled call's late completion recognize
    // it's stale and skip resolving/rejecting the (already-timed-out) call.
    private var currentJob: Job? = null
    @Volatile private var activeCallToken: Long = 0
    // FIX (2026-09-11, root cause of repeated "recognition-timed-out"
    // errors): `isRecording` only covers the audio-capture phase — it
    // flips back to false the moment recordAudio() returns, even though
    // transcribeData() (the slow part, and the part actually responsible
    // for exceeding the JS side's timeout on real devices) keeps running
    // after that. Coroutine cancel() is cooperative and recordAudio()/
    // transcribeData() are blocking native calls with no cancellation
    // checkpoints inside them, so a "cancelled" (JS-timed-out) job keeps
    // running for real in the background. Without a guard spanning the
    // WHOLE call (not just capture), a second mic tap during that window
    // could start a second transcribeData() call reusing the same
    // whisperContext concurrently — whisper.cpp contexts aren't safe for
    // that, which is the likely reason the error log shows repeated
    // timeouts rather than one isolated slow one. isBusy now spans
    // beginTranscription()'s entire lifetime and is the sole guard used
    // to reject an overlapping call.
    @Volatile private var isBusy = false

    // FIX (2026-09-14, real device evidence: user's own error log showed
    // "waited-for-recording=never-started" every single time, and a
    // follow-up screenshot showed the mic then permanently stuck showing
    // "still-processing" on every later tap). Root cause: stop() (called
    // by the JS side's own 60s timeout) only ever set isRecording=false
    // and cancelled the coroutine Job cooperatively — but recordAudio()'s
    // AudioRecord.read() is a synchronous, blocking native call with no
    // suspension point, so a cooperative cancel can't touch it, and the
    // isRecording flag is only checked BETWEEN read() calls, never during
    // one that's actually blocked. If read() itself never returns (mic
    // hardware/driver not delivering samples, audio focus held elsewhere,
    // etc.) the coroutine simply never finishes — isBusy stays true
    // forever, which is exactly why every later tap started rejecting
    // instantly with "still-processing" once this had happened once.
    // Keeping the active AudioRecord reachable here lets stop() call
    // stop()/release() directly ON that same object from a different
    // thread — the standard, documented way to force a concurrently
    // blocked AudioRecord.read() call to return early instead of hanging
    // indefinitely, rather than relying on a flag it may never check.
    @Volatile private var activeRecorder: AudioRecord? = null

    // FIX (2026-09-12, user report: "voice box always open with didn't
    // catch and timeout error without listening to my new voice command").
    // Root cause: preloadModel() is fired once in the background right
    // after app start (see index.html), and its coroutine keeps running
    // regardless of what the JS side does with the returned promise. The
    // JS side then calls preloadModel() a SECOND time when the mic is
    // tapped (racing it against its own 20s wait), and beginTranscription
    // itself could start a THIRD load if whisperContext was still null at
    // that point. Each of those checked only `whisperContext == null` and
    // then unconditionally started its own
    // `WhisperContext.createContextFromFile()` — so on a slow first run
    // (or a quick re-tap before the background preload finished), two or
    // three concurrent loads of the same ~139MB model could end up
    // running at once, fighting over memory/CPU. That easily runs past
    // the JS side's 60s recognition timeout — and since recordAudio()
    // never even starts until a load finishes, the mic box sits there
    // "listening" while nothing is actually being recorded, and the
    // attempt eventually fails with a timeout with no chance to have
    // caught anything the person said.
    // modelLoadJob makes every call site (background preload, mic-tap
    // preload, and beginTranscription's own fallback) share the SAME
    // in-flight load instead of racing separate ones: the first caller
    // starts it, everyone else just awaits that one job.
    private val modelLoadLock = Any()
    @Volatile private var modelLoadJob: Deferred<WhisperContext>? = null
    @Volatile private var modelLoadJobLang: String? = null

    private fun ensureModelLoaded(file: File, lang: String): Deferred<WhisperContext> {
        whisperContext?.let { existing ->
            if (loadedContextLang == lang) return pluginScope.async { existing }
        }
        synchronized(modelLoadLock) {
            whisperContext?.let { existing ->
                if (loadedContextLang == lang) return pluginScope.async { existing }
            }
            modelLoadJob?.let { if (modelLoadJobLang == lang) return it }
            val job = pluginScope.async {
                withContext(Dispatchers.Main) { notifyListeners("modelLoadStart", JSObject()) }
                // ADD (2026-09-15): switching to a different language than
                // whatever's currently loaded — release it first rather
                // than holding two models in memory at once (see
                // loadedContextLang's own comment for why).
                whisperContext?.let { old ->
                    if (loadedContextLang != lang) {
                        try { old.release() } catch (e: Exception) {}
                        whisperContext = null
                        loadedContextLang = null
                    }
                }
                // FIX (2026-09-13): createContextFromFile is a blocking
                // native/JNI call into whisper.cpp with no cancellation
                // checkpoints of its own, so withTimeoutOrNull can't
                // actually interrupt it mid-call if it's truly hung on a
                // bad file — but it DOES stop this coroutine from waiting
                // on it forever, which is what was leaving the mic stuck
                // on "Listening…" indefinitely. Running it on Dispatchers.IO
                // (rather than the plugin's default dispatcher) keeps a
                // hung load from starving other coroutine work too.
                val ctx = withTimeoutOrNull(MODEL_LOAD_TIMEOUT_MS) {
                    withContext(Dispatchers.IO) {
                        WhisperContext.createContextFromFile(file.absolutePath)
                    }
                } ?: run {
                    // Whatever this file is, it isn't safely usable —
                    // delete it and its meta so the very next attempt
                    // starts a clean, verified re-download instead of
                    // hitting this exact same hang again.
                    deleteUnverifiedModel(lang)
                    throw java.io.IOException("model-load-timeout: native load did not return within ${MODEL_LOAD_TIMEOUT_MS}ms")
                }
                whisperContext = ctx
                loadedContextLang = lang
                ctx
            }
            job.invokeOnCompletion {
                synchronized(modelLoadLock) {
                    if (modelLoadJob === job) { modelLoadJob = null; modelLoadJobLang = null }
                }
            }
            modelLoadJob = job
            modelLoadJobLang = lang
            return job
        }
    }

    private fun modelFile(lang: String): File = File(context.filesDir, modelConfig(lang).filename)
    private fun partialFile(lang: String): File = File(context.filesDir, "${modelConfig(lang).filename}.part")
    // Stores the remote file's ETag (or Last-Modified as a fallback, for
    // servers that don't send one) from the last completed download —
    // compared against on checkForUpdate to detect a real revision
    // without downloading the file itself.
    private fun modelMetaFile(lang: String): File = File(context.filesDir, "${modelConfig(lang).filename}.meta")

    // FIX (2026-09-13, user report: voice always goes straight to
    // "Listening…" with no download bar, "Check for Voice Model Updates"
    // says up to date, but recognition has NEVER once worked and always
    // times out). Root cause: isModelReady() only ever checked
    // exists()/length()>0 — it trusted ANY file at this path, including
    // one left behind by an older/unverified code path (this plugin's own
    // download logic didn't always verify completeness — see the download
    // rewrite history above). A truncated/corrupt model file handed to
    // WhisperContext.createContextFromFile() (native whisper.cpp/GGML
    // code) can hang indefinitely with no exception ever thrown back to
    // Kotlin — so preloadModel()'s coroutine just never completes, the
    // mic sits on "Listening…" forever, and the JS side's 60s timeout
    // fires every single time, with nothing ever actually attempted.
    // modelMetaFile() now stores BOTH the ETag/Last-Modified tag (line 1)
    // and the exact expected byte size (line 2) — written only once
    // downloadModel() has itself verified the downloaded bytes match the
    // server's reported Content-Length (see downloadModel below).
    // isModelReady()/isModelFileVerified() below now require a match
    // against that stored size, not just "a file exists" — a file that
    // predates this fix (no meta, or a size mismatch) is treated as NOT
    // ready, which makes the JS side show the real download progress bar
    // and fetch a verified copy instead of trusting a possibly-broken one
    // forever.
    private fun readModelMeta(lang: String): Pair<String, Long>? {
        val f = modelMetaFile(lang)
        if (!f.exists()) return null
        val lines = try { f.readText().trim().lines() } catch (e: Exception) { return null }
        if (lines.isEmpty()) return null
        val tag = lines[0]
        val size = lines.getOrNull(1)?.toLongOrNull() ?: return null
        return tag to size
    }

    private fun writeModelMeta(lang: String, tag: String, size: Long) {
        try {
            modelMetaFile(lang).writeText("$tag\n$size")
        } catch (e: Exception) {
            // Non-fatal — worst case, the next isModelReady() call treats
            // the file as unverified and re-downloads it, which is safe.
        }
    }

    // A model file only counts as trustworthy when its size exactly
    // matches what downloadModel() itself confirmed and recorded — never
    // just "exists and is non-empty". Deletes the untrusted file+meta so
    // nothing else in the app can accidentally treat it as usable either.
    private fun isModelFileVerified(lang: String): Boolean {
        val file = modelFile(lang)
        if (!file.exists() || file.length() <= 0) return false
        val meta = readModelMeta(lang)
        if (meta == null || meta.second != file.length()) {
            deleteUnverifiedModel(lang)
            return false
        }
        return true
    }

    // ADD (2026-09-14, user request): "it downloaded 100% but I can't see
    // anywhere which file/size actually got installed" — lets Settings
    // show real, on-device proof (actual file size on disk right now,
    // not just a one-time toast message) instead of asking the person to
    // just trust that a download succeeded.
    // ADD (2026-09-15): takes an optional "lang" param ("ur" default, for
    // every existing caller that doesn't pass one) so Settings can show
    // status for either model independently.
    @PluginMethod
    fun getModelInfo(call: PluginCall) {
        val lang = call.getString("lang") ?: "ur"
        val file = modelFile(lang)
        val ret = JSObject()
        ret.put("exists", file.exists())
        ret.put("sizeBytes", if (file.exists()) file.length() else 0L)
        ret.put("verified", isModelFileVerified(lang))
        ret.put("loadedInMemory", whisperContext != null && loadedContextLang == lang)
        call.resolve(ret)
    }

    // ADD (2026-09-14, user request): a manual way to discard a model file
    // and force a genuinely fresh re-download, for when someone wants to
    // rule out a bad file themselves rather than waiting for the
    // automatic verification to catch it.
    @PluginMethod
    fun deleteModel(call: PluginCall) {
        deleteUnverifiedModel(call.getString("lang") ?: "ur")
        call.resolve()
    }

    private fun deleteUnverifiedModel(lang: String) {
        try { modelFile(lang).delete() } catch (e: Exception) {}
        try { modelMetaFile(lang).delete() } catch (e: Exception) {}
        if (loadedContextLang == lang) {
            whisperContext = null
            loadedContextLang = null
        }
    }

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
        ret.put("ready", isModelFileVerified(call.getString("lang") ?: "ur"))
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
        val lang = call.getString("lang") ?: "ur"
        if (!isModelFileVerified(lang)) {
            // Nothing downloaded (or verified) yet — this isn't an
            // "update" question, it's a first-download question, which
            // isModelReady/downloadModel already handle. Also covers the
            // unverified-legacy-file case: isModelFileVerified() already
            // deleted it above, so this correctly stops reporting a false
            // "up to date" for a file that was never actually confirmed
            // complete.
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
                conn = (URL(modelConfig(lang).url).openConnection() as HttpURLConnection).apply {
                    requestMethod = "HEAD"
                    connectTimeout = 15000
                    readTimeout = 15000
                    connect()
                }
                val remoteTag = conn.getHeaderField("ETag") ?: conn.getHeaderField("Last-Modified") ?: ""
                val remoteSize = conn.contentLengthLong
                val storedTag = readModelMeta(lang)?.first ?: ""
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
        val lang = call.getString("lang") ?: "ur"
        val allowMobileData = call.getBoolean("allowMobileData", false) ?: false
        if (!hasAnyConnection()) {
            call.reject("no-connection")
            return
        }
        if (!isWifiConnected() && !allowMobileData) {
            call.reject("wifi-required")
            return
        }
        if (isModelFileVerified(lang)) {
            call.resolve()
            return
        }
        val file = modelFile(lang)
        downloadCancelled = false
        pluginScope.launch {
            var conn: HttpURLConnection? = null
            try {
                val tmp = partialFile(lang)
                val existingBytes = if (tmp.exists()) tmp.length() else 0L

                conn = (URL(modelConfig(lang).url).openConnection() as HttpURLConnection).apply {
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
                                        put("lang", lang)
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

                // FIX (2026-09-13): verify the bytes actually on disk match
                // what the server told us to expect BEFORE trusting this as
                // a real, usable model — this is the check that was
                // missing before, which let a truncated/interrupted
                // download quietly become the "ready" model file and hang
                // native loading forever on every future attempt with no
                // error ever surfacing. Only checked when totalBytes is
                // known (>0); a server that never reported a length can't
                // be verified this way, so such a download is rejected
                // outright rather than trusted blind.
                if (totalBytes <= 0 || tmp.length() != totalBytes) {
                    tmp.delete()
                    withContext(Dispatchers.Main) {
                        call.reject("download-incomplete: expected $totalBytes bytes, got ${tmp.length()}")
                    }
                    return@launch
                }

                // ETag captured BEFORE disconnect() — some connection
                // implementations invalidate header access once closed.
                val tag = conn.getHeaderField("ETag") ?: conn.getHeaderField("Last-Modified") ?: ""

                if (!tmp.renameTo(file)) {
                    throw java.io.IOException("Could not finalize downloaded model file")
                }
                // Meta is only ever written here, AFTER the size check
                // above passes — this is precisely what makes
                // isModelFileVerified() trustworthy: a file with no
                // matching meta was never confirmed complete by this code
                // path, so it's always treated as unverified rather than
                // silently assumed good.
                writeModelMeta(lang, tag, file.length())

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

    // ADD (2026-09-10, user report: "mic says timeout but didn't react and
    // process my voice"). Root cause: start() below used to load the
    // ~139MB Whisper model into memory synchronously before it ever
    // started recording, but the JS side showed "Listening…" the instant
    // the mic button was tapped — so for however long model-loading took,
    // the app *looked* like it was listening while it genuinely wasn't,
    // and the JS side's fixed timeout could expire before recording even
    // began, abandoning the whole attempt with nothing ever transcribed.
    // This lets the JS side warm the model up ahead of time (right after
    // app start, once the model file is known to be downloaded — see
    // index.html), so that by the time the mic is actually tapped,
    // start() below usually only has to record + transcribe, not also
    // load a large model first. Emits modelLoadStart so the JS side can
    // show an honest "loading" status for the rare case a tap arrives
    // before the background preload has finished.
    @PluginMethod
    fun preloadModel(call: PluginCall) {
        val lang = call.getString("lang") ?: "ur"
        val file = modelFile(lang)
        if (!isModelFileVerified(lang)) {
            call.reject("model-not-downloaded")
            return
        }
        if (whisperContext != null && loadedContextLang == lang) {
            call.resolve()
            return
        }
        pluginScope.launch {
            try {
                // Shares one in-flight load with any other caller (the
                // background startup preload, or a concurrent mic tap)
                // instead of starting a second, competing native load of
                // the same model — see ensureModelLoaded's comment.
                ensureModelLoaded(file, lang).await()
                withContext(Dispatchers.Main) { call.resolve() }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    call.reject("model-load-failed: " + (e.message ?: e.toString()))
                }
            }
        }
    }

    // Lets the JS side check the model's already-loaded (not just
    // downloaded) state without triggering a load itself.
    @PluginMethod
    fun isModelLoaded(call: PluginCall) {
        val lang = call.getString("lang") ?: "ur"
        val ret = JSObject()
        ret.put("loaded", whisperContext != null && loadedContextLang == lang)
        call.resolve(ret)
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
        val lang = call.getString("lang") ?: "ur"
        val file = modelFile(lang)
        if (!isModelFileVerified(lang)) {
            call.reject("model-not-downloaded")
            return
        }
        if (isBusy) {
            // More accurate than "already-recording" now that this guard
            // spans transcription too — a previous call's inference may
            // still be finishing in the background even though the JS
            // side already gave up on it. The JS side can show a
            // friendlier "still working on the last command" message
            // for this specific reason.
            call.reject("still-processing")
            return
        }
        isBusy = true
        val myToken = ++activeCallToken
        currentJob = pluginScope.launch {
            try {
                // Loaded once, reused across calls — reloading a ~139MB
                // model on every single mic tap would make each command
                // noticeably slower than it needs to be after the first.
                // Normally this has already happened via the JS side's
                // background preloadModel() call (see there for why), so
                // this is just a safety net for whenever that hasn't run
                // or hasn't finished yet.
                // Shares the same in-flight load as preloadModel() rather
                // than starting a second concurrent one — see
                // ensureModelLoaded's comment for why that mattered.
                if (whisperContext == null || loadedContextLang != lang) {
                    ensureModelLoaded(file, lang).await()
                }
                // Fires only once the model is actually loaded and audio
                // capture is about to begin — this is the point the JS
                // side's "Listening…" status is genuinely true, unlike
                // before when that text was shown the instant the mic
                // button was tapped, well before recording had started.
                withContext(Dispatchers.Main) { notifyListeners("recordingStarted", JSObject()) }
                val audio = withContext(Dispatchers.IO) { recordAudio() }
                if (myToken != activeCallToken) return@launch // cancelled/stale — JS already gave up on this call
                if (audio.isEmpty()) {
                    withContext(Dispatchers.Main) { call.reject("no-speech") }
                    return@launch
                }
                // ADD: lets the JS side switch its status text from
                // "Listening…" to something that reflects what's actually
                // happening now — on-device inference on a real phone can
                // take several more seconds after recording ends, and
                // without this the mic modal looked frozen the whole time.
                withContext(Dispatchers.Main) { notifyListeners("transcribing", JSObject()) }
                // printTimestamp = false: this app wants plain command
                // text, not a timestamped transcript. language: "auto" for
                // the Roman-Urdu model (required by its own model card),
                // "en" for the English-only model (whisper.cpp's own
                // documented guidance for .en models) — see modelConfig.
                val text = whisperContext!!.transcribeData(audio, printTimestamp = false, language = modelConfig(lang).whisperLang)
                if (myToken != activeCallToken) return@launch // JS timed out while we were transcribing — drop this result
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
            } catch (e: CancellationException) {
                // Expected when stop() cancels this job (JS-side timeout) — not a real error, nothing to report.
            } catch (e: Exception) {
                if (myToken == activeCallToken) {
                    withContext(Dispatchers.Main) { call.reject("transcribe-failed: " + (e.message ?: e.toString())) }
                }
            } finally {
                isRecording = false
                isBusy = false
            }
        }
    }

    // Captures microphone audio at 48kHz (RNNoise's native rate),
    // denoises it frame-by-frame through RNNoise, then downsamples the
    // CLEANED audio to the float32, [-1, 1]-normalized, 16kHz mono format
    // whisper.cpp's transcribeData expects.
    private fun recordAudio(): FloatArray {
        val minBufSize = AudioRecord.getMinBufferSize(
            CAPTURE_SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
        )
        // FIX (2026-09-15, user report: "should be active noise
        // cancellation/voice focused"). VOICE_RECOGNITION is Android's own
        // platform-level tuning for speech input (device-dependent, not
        // guaranteed) — kept as a first layer even now that real DSP
        // denoising (RNNoise, below) does the actual noise removal work.
        val record = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION, CAPTURE_SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT, minBufSize * 4
        )
        // ADD (2026-09-15, user request: "did you install active noise
        // cancellation" -> "yes do it"). One denoiser per recording — its
        // internal state (pitch history, spectral tracking) is meant to
        // follow one continuous stream, not be reused across separate
        // recordings. If creation fails for any reason (should not happen
        // given this was verified against the real compiled library
        // before shipping, but native calls can still surprise), recording
        // falls back to raw undenoised audio rather than failing outright.
        val denoiser = RnnoiseDenoiser.create()
        val frameSize = RnnoiseDenoiser.FRAME_SIZE // 480 samples = 10ms @ 48kHz
        val maxCaptureSamples = CAPTURE_SAMPLE_RATE * MAX_RECORD_SECONDS
        val minFramesBeforeEarlyStop = ((MIN_RECORD_SECONDS * 1000) / 10).toInt()
        val silenceFramesToStop = ((SILENCE_STOP_SECONDS * 1000) / 10).toInt()
        val readBuffer = ShortArray(minBufSize)
        val frameCarry = FloatArray(frameSize) // accumulates samples until one full RNNoise frame is ready
        var frameCarryLevel = 0
        val denoiseInput = FloatArray(frameSize)
        val denoiseOutput = FloatArray(frameSize)
        // Denoised 48kHz output, preallocated to the worst case (full
        // MAX_RECORD_SECONDS) — samplesWritten tracks how much is
        // actually filled, same pattern as the plain-amplitude version
        // this replaced.
        val denoised48k = FloatArray(maxCaptureSamples)
        var samplesWritten = 0
        var framesProcessed = 0
        var hasDetectedSpeech = false
        var silentFramesInARow = 0
        var consecutiveVadFrames = 0
        isRecording = true
        activeRecorder = record
        record.startRecording()
        try {
            while (isRecording && samplesWritten < maxCaptureSamples) {
                val toRead = minOf(readBuffer.size, maxCaptureSamples - samplesWritten + (frameSize - frameCarryLevel))
                val n = record.read(readBuffer, 0, minOf(toRead, readBuffer.size))
                if (n <= 0) break
                var i = 0
                while (i < n) {
                    // Fill the current frame from wherever the raw read
                    // left off, one sample at a time, in RNNoise's own
                    // expected raw-PCM-scale float (no /32768 here — see
                    // jni.c's note on why normalizing before RNNoise would
                    // be wrong).
                    val samplesToCopy = minOf(n - i, frameSize - frameCarryLevel)
                    for (j in 0 until samplesToCopy) {
                        frameCarry[frameCarryLevel + j] = readBuffer[i + j].toFloat()
                    }
                    frameCarryLevel += samplesToCopy
                    i += samplesToCopy
                    if (frameCarryLevel < frameSize) break // not a full frame yet — wait for more data next read()
                    // A full 480-sample frame is ready — denoise it.
                    System.arraycopy(frameCarry, 0, denoiseInput, 0, frameSize)
                    frameCarryLevel = 0
                    val vad = denoiser?.denoiseFrame(denoiseInput, denoiseOutput) ?: run {
                        // No denoiser available — pass the frame through
                        // unmodified rather than losing audio.
                        System.arraycopy(denoiseInput, 0, denoiseOutput, 0, frameSize)
                        0f
                    }
                    framesProcessed++
                    val roomLeft = maxCaptureSamples - samplesWritten
                    val toWrite = minOf(frameSize, roomLeft)
                    System.arraycopy(denoiseOutput, 0, denoised48k, samplesWritten, toWrite)
                    samplesWritten += toWrite
                    // FIX (2026-09-15, user report: "keeps recording even
                    // after I stopped speaking because of background
                    // noise"). RNNoise's own VAD probability — a real
                    // trained classifier, not a loudness comparison —
                    // replaces the earlier amplitude-threshold heuristic
                    // entirely. A frame has to cross VAD_SPEECH_THRESHOLD
                    // for VAD_FRAMES_TO_COUNT_AS_SPEECH consecutive frames
                    // before counting as resumed speech, same
                    // noise-transient filtering idea as before, just
                    // driven by a genuinely noise-robust signal now.
                    if (vad >= VAD_SPEECH_THRESHOLD) {
                        consecutiveVadFrames++
                        if (consecutiveVadFrames >= VAD_FRAMES_TO_COUNT_AS_SPEECH) {
                            hasDetectedSpeech = true
                            silentFramesInARow = 0
                        } else {
                            silentFramesInARow++
                        }
                    } else {
                        consecutiveVadFrames = 0
                        silentFramesInARow++
                    }
                    if (hasDetectedSpeech && framesProcessed >= minFramesBeforeEarlyStop && silentFramesInARow >= silenceFramesToStop) {
                        isRecording = false
                        break
                    }
                    if (samplesWritten >= maxCaptureSamples) break
                }
            }
        } finally {
            isRecording = false
            activeRecorder = null
            try { record.stop() } catch (e: Exception) {}
            try { record.release() } catch (e: Exception) {}
            try { denoiser?.release() } catch (e: Exception) {}
        }
        // Downsample the denoised 48kHz audio to whisper.cpp's expected
        // 16kHz — an exact 3:1 ratio, decimated with a simple 3-sample box
        // average for basic anti-aliasing (cheap, and more than adequate
        // here: RNNoise's own denoising already dominates audio quality
        // far more than this simple averaging step could hurt it).
        // Normalizes to [-1, 1] at this same step, matching what
        // transcribeData/whisper.cpp expects.
        val outSamples = samplesWritten / 3
        return FloatArray(outSamples) { idx ->
            val base = idx * 3
            val sum = denoised48k[base] + denoised48k[base + 1] + denoised48k[base + 2]
            (sum / 3f) / 32768.0f
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        isRecording = false
        activeCallToken++ // invalidates the in-flight call's token so its late completion is dropped
        // FIX (2026-09-14): force-stop the actual AudioRecord, not just the
        // isRecording flag — a blocked read() call only checks that flag
        // BETWEEN reads, never while genuinely stuck inside one. Calling
        // stop()/release() directly on the same AudioRecord instance from
        // this thread is what actually makes a concurrently blocked
        // read() call on another thread return, instead of hanging until
        // the device's mic driver eventually delivers data on its own —
        // which on this evidence may be never. Also releases isBusy
        // immediately here rather than only in recordAudio()'s own
        // finally block, so a stuck attempt can't lock out every future
        // mic tap with "still-processing" the way it just did.
        activeRecorder?.let {
            try { it.stop() } catch (e: Exception) {}
            try { it.release() } catch (e: Exception) {}
        }
        activeRecorder = null
        currentJob?.cancel()
        currentJob = null
        isBusy = false
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
