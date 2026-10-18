package app.trashee.player

import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

private fun hexBytes(hex: String): ByteArray =
    ByteArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

/** AES-128-CTR with a zero nonce; seeks by advancing the counter, so Range requests keep working. */
fun aesCtrCipher(keyHex: String, startOffset: Long): Cipher {
    val iv = ByteArray(16)
    val block = startOffset / 16
    for (i in 0 until 8) iv[15 - i] = (block ushr (8 * i)).toByte()
    val cipher = Cipher.getInstance("AES/CTR/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(hexBytes(keyHex), "AES"), IvParameterSpec(iv))
    val misalign = (startOffset % 16).toInt()
    if (misalign != 0) cipher.update(ByteArray(misalign))
    return cipher
}
