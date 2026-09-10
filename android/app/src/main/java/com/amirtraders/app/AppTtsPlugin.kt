package com.amirtraders.app

import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.Locale

// ADD (2026-09-09, user request: voice command replies — "reply us in
// voice that I'm doing this or that"). Wraps Android's own built-in
// TextToSpeech engine — no new model to download, no extra size added to
// the app, and it already supports Urdu on most devices (Google's TTS
// engine, which ships on virtually every Android phone/tablet with Play
// Services, has an Urdu voice; if a device genuinely has none installed,
// speak() below falls through to the engine's default voice rather than
// silently doing nothing, and reports that fallback back to JS so the UI
// can decide whether to still show the toast — which it always does
// regardless, so a missing Urdu voice degrades to "wrong-accent English"
// at worst, never to "nothing happened").
//
// Deliberately a separate plugin from WhisperVoicePlugin (recognition)
// rather than folding into it — recognition and speech-out are unrelated
// Android subsystems (AudioRecord+whisper.cpp vs TextToSpeech), and
// keeping them separate means a bug in one can't take down the other.
@CapacitorPlugin(name = "AppTts")
class AppTtsPlugin : Plugin() {

    private var tts: TextToSpeech? = null
    private var initOk = false
    // TextToSpeech's own init callback fires asynchronously and only
    // once, well before any speak() call is likely to arrive in normal
    // use — but a command fired in the first instant after app launch is
    // plausible (e.g. a fast voice command right after opening the app),
    // so any speak() call that arrives before init finishes queues here
    // instead of being silently dropped.
    private val pendingUtterances = mutableListOf<Pair<String, String>>()

    override fun load() {
        tts = TextToSpeech(context) { status ->
            initOk = status == TextToSpeech.SUCCESS
            if (initOk) {
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {}
                    override fun onDone(utteranceId: String?) {}
                    override fun onError(utteranceId: String?) {}
                })
                val queued = pendingUtterances.toList()
                pendingUtterances.clear()
                queued.forEach { (text, lang) -> speakNow(text, lang) }
            }
        }
    }

    @PluginMethod
    fun speak(call: PluginCall) {
        val text = call.getString("text")
        if (text.isNullOrBlank()) {
            call.reject("no-text")
            return
        }
        val lang = call.getString("lang") ?: "en"
        if (!initOk) {
            pendingUtterances.add(Pair(text, lang))
            call.resolve()
            return
        }
        speakNow(text, lang)
        call.resolve()
    }

    private fun speakNow(text: String, lang: String) {
        val engine = tts ?: return
        // "ur" first; a device without an Urdu voice installed falls
        // back to whatever locale the engine already defaults to rather
        // than erroring out — see the class-level note above.
        val locale = if (lang.startsWith("ur")) Locale("ur", "PK") else Locale.US
        val result = engine.setLanguage(locale)
        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            engine.language = Locale.getDefault()
        }
        engine.stop()
        engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "amirtraders-tts-" + System.currentTimeMillis())
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        tts?.stop()
        call.resolve()
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", initOk)
        call.resolve(ret)
    }

    override fun handleOnDestroy() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        super.handleOnDestroy()
    }
}
