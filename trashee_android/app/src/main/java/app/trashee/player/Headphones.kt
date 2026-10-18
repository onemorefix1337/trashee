package app.trashee.player

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build

private val PERSONAL_OUTPUTS = setOf(
    AudioDeviceInfo.TYPE_WIRED_HEADSET,
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
    AudioDeviceInfo.TYPE_USB_HEADSET,
    AudioDeviceInfo.TYPE_HEARING_AID,
)

/** Headphones, wired or Bluetooth, are plugged in or connected right now. */
fun headphonesConnected(context: Context): Boolean {
    val audio = context.getSystemService(AudioManager::class.java) ?: return false
    return audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { device ->
        device.type in PERSONAL_OUTPUTS || (Build.VERSION.SDK_INT >= 31 && device.type == AudioDeviceInfo.TYPE_BLE_HEADSET)
    }
}
