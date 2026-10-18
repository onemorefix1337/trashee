package app.trashee.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.trashee.data.Session

@Composable
private fun PrimaryButton(text: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val accent = LocalAccent.current
    Box(
        modifier
            .height(52.dp)
            .clip(RoundedCornerShape(26.dp))
            .background(accent)
            .pressable(onClick = onClick)
            .padding(horizontal = 28.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = Color.Black, fontSize = 16.sp, fontWeight = FontWeight.SemiBold) }
}

@Composable
fun SecondaryButton(text: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier
            .height(44.dp)
            .clip(RoundedCornerShape(22.dp))
            .background(Palette.SurfaceHover)
            .pressable(onClick = onClick)
            .padding(horizontal = 20.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, color = Palette.Text, fontSize = 14.sp, fontWeight = FontWeight.Medium) }
}

@Composable
fun LoginScreen(session: Session) {
    val app = LocalApp.current
    val context = LocalContext.current
    CompositionLocalProvider(LocalAccent provides Color(0xFFFF6B8B)) {
        Box(Modifier.fillMaxSize().background(Palette.Bg)) {
            Ambient(playing = true)
            Column(
                Modifier.fillMaxSize().safeDrawingPadding().padding(28.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Logo(size = 96.dp, animated = true)
                Spacer(Modifier.height(20.dp))
                Text(
                    "trashee",
                    style = TextStyle(brush = BrandGradient, fontSize = 44.sp, fontWeight = FontWeight.Bold),
                )
                Text("Неофициальный клиент Яндекс Музыки", color = Palette.Muted, fontSize = 14.sp, textAlign = TextAlign.Center)
                Spacer(Modifier.height(40.dp))

                AnimatedContent(
                    targetState = session,
                    contentKey = { s ->
                        when (s) {
                            is Session.Restoring -> "restoring"
                            is Session.Offline -> "offline"
                            is Session.LoggedOut -> if (s.code != null) "code" else if (s.busy) "busy" else "start"
                            is Session.Ready -> "ready"
                        }
                    },
                    transitionSpec = { (fadeIn() + slideInVertically { it / 8 }) togetherWith fadeOut() },
                    label = "login",
                ) { state ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        when (state) {
                            is Session.Restoring -> CircularProgressIndicator(color = LocalAccent.current, modifier = Modifier.size(32.dp))
                            is Session.Offline -> {
                                Text("Не удалось связаться с Яндексом", color = Palette.Text, fontSize = 16.sp)
                                Text("Вход сохранён, проверь интернет", color = Palette.Muted, fontSize = 13.sp)
                                Spacer(Modifier.height(20.dp))
                                PrimaryButton("Повторить") { app.repo.restore() }
                                Spacer(Modifier.height(10.dp))
                                SecondaryButton("Войти заново") { app.repo.logout() }
                            }
                            is Session.LoggedOut -> {
                                val code = state.code
                                if (code == null) {
                                    if (state.busy) {
                                        CircularProgressIndicator(color = LocalAccent.current, modifier = Modifier.size(32.dp))
                                    } else {
                                        state.error?.let {
                                            Text(it, color = Palette.Danger, fontSize = 14.sp, textAlign = TextAlign.Center)
                                            Spacer(Modifier.height(14.dp))
                                        }
                                        PrimaryButton("Войти через Яндекс") { app.repo.startLogin() }
                                    }
                                } else {
                                    Text("Введи этот код на странице Яндекса", color = Palette.Muted, fontSize = 14.sp)
                                    Spacer(Modifier.height(12.dp))
                                    Text(
                                        code.userCode,
                                        color = Palette.Text,
                                        fontSize = 40.sp,
                                        fontWeight = FontWeight.Bold,
                                        letterSpacing = 6.sp,
                                    )
                                    Spacer(Modifier.height(18.dp))
                                    PrimaryButton("Открыть страницу входа") {
                                        runCatching {
                                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(code.verificationUrl)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                                        }
                                    }
                                    Spacer(Modifier.height(10.dp))
                                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        SecondaryButton("Скопировать код") {
                                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                            clipboard.setPrimaryClip(ClipData.newPlainText("trashee", code.userCode))
                                        }
                                        SecondaryButton("Отмена") { app.repo.cancelLogin() }
                                    }
                                    Spacer(Modifier.height(18.dp))
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                        CircularProgressIndicator(color = Palette.Muted, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
                                        Text("Ждём подтверждения", color = Palette.Muted, fontSize = 13.sp)
                                    }
                                }
                            }
                            is Session.Ready -> Unit
                        }
                    }
                }
                Spacer(Modifier.fillMaxWidth().height(24.dp))
            }
        }
    }
}
