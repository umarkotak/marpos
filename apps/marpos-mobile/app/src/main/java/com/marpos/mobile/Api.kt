package com.marpos.mobile

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class ApiError(val status: Int, message: String) : Exception(message)

class Api(context: Context, val base: String) {
    private val prefs = context.getSharedPreferences("session-${base.hashCode()}", Context.MODE_PRIVATE)
    fun clearSession() { check(prefs.edit().clear().commit()) }
    fun request(path: String, method: String = "GET", body: JSONObject? = null): Any {
        val bytes = body?.toString()?.toByteArray(Charsets.UTF_8)
        return exchange(path, method, bytes, "application/json")
    }
    fun upload(path: String, bytes: ByteArray, mime: String): JSONObject {
        val boundary = "Marpos${uuid()}"
        val header = "--$boundary\r\nContent-Disposition: form-data; name=\"image\"; filename=\"upload\"\r\nContent-Type: $mime\r\n\r\n".toByteArray()
        return exchange(path, "POST", header + bytes + "\r\n--$boundary--\r\n".toByteArray(), "multipart/form-data; boundary=$boundary") as JSONObject
    }
    private fun exchange(path: String, method: String, body: ByteArray?, contentType: String): Any {
        require(path.startsWith("/") && !path.contains(".."))
        val connection = URL(base + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 8000
            connection.readTimeout = if (contentType.startsWith("multipart")) 45000 else 8000
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Accept", "application/json")
            prefs.getString("cookie", null)?.let { connection.setRequestProperty("Cookie", it) }
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", contentType)
                connection.outputStream.use { it.write(body) }
            }
            val status = connection.responseCode
            if(status<0) throw java.io.IOException("The server connection closed before confirming the request.")
            val text = (if (status in 200..299) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            val result = runCatching { JSONObject(text) }.getOrNull()
            if (status !in 200..299 || result?.optBoolean("success") != true) {
                throw ApiError(status, result?.optJSONObject("error")?.optString("message") ?: "The server could not complete the request ($status).")
            }
            connection.headerFields.entries.filter { it.key.equals("Set-Cookie", true) }.flatMap { it.value }.firstOrNull { it.startsWith("marpos_session=") }?.let {
                check(prefs.edit().putString("cookie", it.substringBefore(';')).commit()) { "Could not save the sign-in session." }
            }
            return result.opt("data") ?: JSONObject.NULL
        } finally { connection.disconnect() }
    }
}
