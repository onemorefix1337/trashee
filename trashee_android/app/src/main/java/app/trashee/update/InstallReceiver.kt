package app.trashee.update

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentSender
import android.content.pm.PackageInstaller
import app.trashee.TrasheeApp

/** Gets the verdict of the system installer. Some updates need the user's tap first; this opens that window. */
class InstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as TrasheeApp
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (confirm != null) context.startActivity(confirm)
            }
            // On success the system replaces and stops this app; there is nothing more to do here.
            PackageInstaller.STATUS_SUCCESS -> Unit
            PackageInstaller.STATUS_FAILURE_ABORTED -> app.updater.onInstallFailed(null, cancelled = true)
            else -> app.updater.onInstallFailed(intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE), cancelled = false)
        }
    }

    companion object {
        fun intentSender(context: Context, sessionId: Int): IntentSender {
            val intent = Intent(context, InstallReceiver::class.java).setPackage(context.packageName)
            // Mutable: the system adds the status and the confirmation window to it.
            return PendingIntent.getBroadcast(
                context, sessionId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            ).intentSender
        }
    }
}
