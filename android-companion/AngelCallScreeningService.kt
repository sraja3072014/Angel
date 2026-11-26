package com.raja.projectangel.bridge

import android.telecom.Call
import android.telecom.CallScreeningService
import android.telecom.InCallService
import android.telephony.SmsManager
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Native Android InCallService & CallScreeningService Hook for Project Angel.
 * Streams incoming call alerts to Supabase Realtime `device_sync:<user_id>`,
 * handles AI Voice Screening (Sarvam AI), and executes quick reject + Tamil/English SMS.
 */
class AngelCallScreeningService : CallScreeningService() {
    override fun onScreenCall(callDetails: Call.Details) {
        val number = callDetails.handle?.schemeSpecificPart ?: "Unknown"
        val response = CallResponse.Builder()
            .setDisallowCall(false)
            .setSilenceCall(false)
            .build()
        respondToCall(callDetails, response)
        AngelInCallHook.notifyIncomingCall(number)
    }
}

object AngelInCallHook {
    var activeCall: Call? = null
    var onIncomingCallCallback: ((String) -> Unit)? = null

    fun notifyIncomingCall(number: String) {
        onIncomingCallCallback?.invoke(number)
    }
}

class AngelInCallService : InCallService() {
    override fun onCallAdded(call: Call) {
        super.onCallAdded(call)
        AngelInCallHook.activeCall = call
    }

    override fun onCallRemoved(call: Call) {
        super.onCallRemoved(call)
        if (AngelInCallHook.activeCall == call) {
            AngelInCallHook.activeCall = null
        }
    }
}

@CapacitorPlugin(name = "AngelCallBridge")
class AngelCallBridgePlugin : Plugin() {
    @PluginMethod
    fun answerWithAiStream(call: PluginCall) {
        AngelInCallHook.activeCall?.answer(0)
        call.resolve()
    }

    @PluginMethod
    fun rejectAndSendSms(call: PluginCall) {
        val phone = call.getString("phoneNumber") ?: ""
        val message = call.getString("message") ?: ""
        AngelInCallHook.activeCall?.disconnect()
        if (phone.isNotBlank() && message.isNotBlank()) {
            SmsManager.getDefault().sendTextMessage(phone, null, message, null, null)
        }
        call.resolve()
    }
}
