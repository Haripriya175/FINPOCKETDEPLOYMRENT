package com.finpocket.finpocket_app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.os.Bundle
import android.provider.ContactsContract
import android.provider.Telephony
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity() {
    private val SMS_CHANNEL = "com.finpocket/bank_sms"
    private val UPI_CHANNEL = "com.finpocket/upi_payment"
    private val SHARE_CHANNEL = "com.finpocket/share"
    private val SMS_PERMISSION_REQ_CODE = 1001
    private val CONTACTS_PERMISSION_REQ_CODE = 1002
    private val UPI_PAY_REQ_CODE = 2001

    private var pendingPermissionResult: MethodChannel.Result? = null
    private var pendingContactsPermissionResult: MethodChannel.Result? = null
    private var pendingUpiResult: MethodChannel.Result? = null
    private var smsChannel: MethodChannel? = null
    private var smsObserver: android.database.ContentObserver? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // 0. File share channel — opens WhatsApp directly with a file attached.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, SHARE_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "shareFileToWhatsApp" -> {
                    val filePath = call.argument<String>("filePath")
                    val phone = call.argument<String>("phone") ?: ""
                    if (filePath.isNullOrEmpty()) {
                        result.error("INVALID_ARGS", "filePath is required", null)
                        return@setMethodCallHandler
                    }
                    try {
                        val file = java.io.File(filePath)
                        if (!file.exists()) {
                            result.error("FILE_NOT_FOUND", "File does not exist: $filePath", null)
                            return@setMethodCallHandler
                        }
                        val uri = androidx.core.content.FileProvider.getUriForFile(
                            this,
                            "${packageName}.fileprovider",
                            file
                        )
                        val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                            type = when {
                                filePath.endsWith(".pdf", ignoreCase = true) -> "application/pdf"
                                filePath.endsWith(".csv", ignoreCase = true) -> "text/csv"
                                else -> "application/octet-stream"
                            }
                            putExtra(android.content.Intent.EXTRA_STREAM, uri)
                            addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            if (phone.isNotEmpty()) {
                                setPackage("com.whatsapp")
                            }
                        }
                        if (intent.resolveActivity(packageManager) != null) {
                            startActivity(intent)
                            result.success(true)
                        } else {
                            // WhatsApp not installed — fall back to share sheet.
                            val shareIntent = android.content.Intent.createChooser(intent, "Send via")
                            startActivity(shareIntent)
                            result.success(true)
                        }
                    } catch (e: Exception) {
                        result.error("SHARE_FAILED", e.localizedMessage ?: "Could not share file", null)
                    }
                }
                "downloadToDownloads" -> {
                    val filePath = call.argument<String>("filePath")
                    if (filePath.isNullOrEmpty()) {
                        result.error("INVALID_ARGS", "filePath is required", null)
                        return@setMethodCallHandler
                    }
                    try {
                        val srcFile = java.io.File(filePath)
                        if (!srcFile.exists()) {
                            result.error("FILE_NOT_FOUND", "File does not exist", null)
                            return@setMethodCallHandler
                        }
                        val fileName = srcFile.name
                        val mimeType = when {
                            fileName.endsWith(".pdf", ignoreCase = true) -> "application/pdf"
                            fileName.endsWith(".csv", ignoreCase = true) -> "text/csv"
                            else -> "application/octet-stream"
                        }

                        var savedUri: android.net.Uri? = null

                        // 1. Android Q+ (API 29+): Scoped storage MediaStore Downloads
                        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                            try {
                                val values = android.content.ContentValues().apply {
                                    put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                                    put(android.provider.MediaStore.MediaColumns.MIME_TYPE, mimeType)
                                    put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_DOWNLOADS)
                                    put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1)
                                }
                                val collection = android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI
                                val uri = contentResolver.insert(collection, values)
                                if (uri != null) {
                                    contentResolver.openOutputStream(uri)?.use { out ->
                                        srcFile.inputStream().use { input ->
                                            input.copyTo(out)
                                        }
                                    }
                                    values.clear()
                                    values.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 0)
                                    contentResolver.update(uri, values, null, null)
                                    savedUri = uri
                                }
                            } catch (_: Exception) {}
                        }

                        // 2. Direct public Downloads folder fallback
                        if (savedUri == null) {
                            val publicDownloads = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS)
                            if (!publicDownloads.exists()) {
                                publicDownloads.mkdirs()
                            }
                            val destFile = java.io.File(publicDownloads, fileName)
                            srcFile.copyTo(destFile, overwrite = true)
                            android.media.MediaScannerConnection.scanFile(
                                applicationContext,
                                arrayOf(destFile.absolutePath),
                                arrayOf(mimeType),
                                null
                            )
                            savedUri = android.net.Uri.fromFile(destFile)
                        }

                        result.success(savedUri?.toString() ?: "saved")
                    } catch (e: Exception) {
                        result.error("DOWNLOAD_FAILED", e.localizedMessage ?: "Could not save to Downloads", null)
                    }
                }
                else -> result.notImplemented()
            }
        }

        // 1. Bank SMS Channel
        val smsChannelLocal = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, SMS_CHANNEL)
        smsChannel = smsChannelLocal
        smsChannelLocal.setMethodCallHandler { call, result ->
            when (call.method) {
                "startSmsObserver" -> {
                    // Event-driven auto-sync: watch the SMS inbox and ping Dart
                    // the instant a new message lands (i.e. a transaction SMS).
                    try {
                        if (smsObserver == null) {
                            smsObserver = object : android.database.ContentObserver(android.os.Handler(android.os.Looper.getMainLooper())) {
                                override fun onChange(selfChange: Boolean) {
                                    // Debounce at the Dart side; here we just signal.
                                    runOnUiThread {
                                        try {
                                            smsChannel?.invokeMethod("onSmsChanged", null)
                                        } catch (_: Exception) {}
                                    }
                                }
                            }
                            contentResolver.registerContentObserver(
                                Telephony.Sms.CONTENT_URI,
                                true,
                                smsObserver!!
                            )
                        }
                        result.success(true)
                    } catch (e: Exception) {
                        result.success(false)
                    }
                }
                "stopSmsObserver" -> {
                    smsObserver?.let {
                        try { contentResolver.unregisterContentObserver(it) } catch (_: Exception) {}
                    }
                    smsObserver = null
                    result.success(true)
                }
                "hasSmsPermission" -> {
                    val hasPerm = ContextCompat.checkSelfPermission(
                        this,
                        Manifest.permission.READ_SMS
                    ) == PackageManager.PERMISSION_GRANTED
                    result.success(hasPerm)
                }
                "requestSmsPermission" -> {
                    if (ContextCompat.checkSelfPermission(
                            this,
                            Manifest.permission.READ_SMS
                        ) == PackageManager.PERMISSION_GRANTED
                    ) {
                        result.success(true)
                    } else {
                        pendingPermissionResult = result
                        ActivityCompat.requestPermissions(
                            this,
                            arrayOf(Manifest.permission.READ_SMS),
                            SMS_PERMISSION_REQ_CODE
                        )
                    }
                }
                "hasContactsPermission" -> {
                    val hasPerm = ContextCompat.checkSelfPermission(
                        this,
                        Manifest.permission.READ_CONTACTS
                    ) == PackageManager.PERMISSION_GRANTED
                    result.success(hasPerm)
                }
                "requestContactsPermission" -> {
                    if (ContextCompat.checkSelfPermission(
                            this,
                            Manifest.permission.READ_CONTACTS
                        ) == PackageManager.PERMISSION_GRANTED
                    ) {
                        result.success(true)
                    } else {
                        pendingContactsPermissionResult = result
                        ActivityCompat.requestPermissions(
                            this,
                            arrayOf(Manifest.permission.READ_CONTACTS),
                            CONTACTS_PERMISSION_REQ_CODE
                        )
                    }
                }
                "getContactsMap" -> {
                    if (ContextCompat.checkSelfPermission(
                            this,
                            Manifest.permission.READ_CONTACTS
                        ) != PackageManager.PERMISSION_GRANTED
                    ) {
                        result.success(emptyMap<String, String>())
                        return@setMethodCallHandler
                    }
                    try {
                        val map = mutableMapOf<String, String>()
                        val uri = ContactsContract.CommonDataKinds.Phone.CONTENT_URI
                        val projection = arrayOf(
                            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                            ContactsContract.CommonDataKinds.Phone.NUMBER
                        )
                        val cursor = contentResolver.query(uri, projection, null, null, null)
                        cursor?.use {
                            val nameIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                            val numIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                            while (it.moveToNext()) {
                                val name = if (nameIdx >= 0) it.getString(nameIdx)?.trim() ?: "" else ""
                                val num = if (numIdx >= 0) it.getString(numIdx) ?: "" else ""
                                val digits = num.replace(Regex("[^0-9]"), "")
                                if (name.isNotBlank() && digits.length >= 10) {
                                    val last10 = digits.takeLast(10)
                                    if (!map.containsKey(last10) || map[last10]!!.length < name.length) {
                                        map[last10] = name
                                    }
                                }
                            }
                        }
                        result.success(map)
                    } catch (e: Exception) {
                        result.success(emptyMap<String, String>())
                    }
                }
                "readBankSms" -> {
                    if (ContextCompat.checkSelfPermission(
                            this,
                            Manifest.permission.READ_SMS
                        ) != PackageManager.PERMISSION_GRANTED
                    ) {
                        result.error("PERMISSION_DENIED", "READ_SMS permission is not granted", null)
                        return@setMethodCallHandler
                    }

                    try {
                        val limit = (call.argument<Int>("limit") ?: 100).coerceIn(1, 500)
                        val messages = mutableListOf<Map<String, Any>>()
                        val uri: Uri = Telephony.Sms.Inbox.CONTENT_URI
                        val projection = arrayOf(
                            Telephony.Sms.ADDRESS,
                            Telephony.Sms.BODY,
                            Telephony.Sms.DATE
                        )
                        val sortOrder = "${Telephony.Sms.DATE} DESC LIMIT $limit"

                        val cursor: Cursor? = contentResolver.query(
                            uri,
                            projection,
                            null,
                            null,
                            sortOrder
                        )

                        cursor?.use {
                            val addrIdx = it.getColumnIndex(Telephony.Sms.ADDRESS)
                            val bodyIdx = it.getColumnIndex(Telephony.Sms.BODY)
                            val dateIdx = it.getColumnIndex(Telephony.Sms.DATE)

                            while (it.moveToNext()) {
                                val address = if (addrIdx >= 0) it.getString(addrIdx) ?: "" else ""
                                val body = if (bodyIdx >= 0) it.getString(bodyIdx) ?: "" else ""
                                val date = if (dateIdx >= 0) it.getLong(dateIdx) else 0L

                                messages.add(
                                    mapOf(
                                        "address" to address,
                                        "body" to body,
                                        "date" to date
                                    )
                                )
                            }
                        }

                        result.success(messages)
                    } catch (e: Exception) {
                        result.error("QUERY_FAILED", e.localizedMessage ?: "Failed to read SMS", null)
                    }
                }
                else -> result.notImplemented()
            }
        }

        // 2. Real UPI Payments Channel
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, UPI_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "getInstalledUpiApps" -> {
                    try {
                        val upiUri = Uri.parse("upi://pay")
                        val upiIntent = Intent(Intent.ACTION_VIEW, upiUri)
                        val packageManager = packageManager
                        val activities = packageManager.queryIntentActivities(upiIntent, 0)
                        val appList = mutableListOf<Map<String, String>>()
                        val seen = mutableSetOf<String>()

                        for (info in activities) {
                            val packageName = info.activityInfo.packageName
                            if (!seen.add(packageName)) continue
                            val appName = info.loadLabel(packageManager).toString()
                            appList.add(
                                mapOf(
                                    "packageName" to packageName,
                                    "appName" to appName
                                )
                            )
                        }

                        // Not every UPI app advertises a generic `upi://pay`
                        // intent filter. Paytm, notably, is installed and can
                        // take a payment but never shows up in the query above,
                        // which made the Pay screen wrongly report it as "not
                        // installed". Add the well-known UPI apps by package
                        // presence too.
                        val knownUpiApps = mapOf(
                            "com.google.android.apps.nbu.paisa.user" to "Google Pay",
                            "com.phonepe.app" to "PhonePe",
                            "net.one97.paytm" to "Paytm",
                            "in.org.npci.upiapp" to "BHIM",
                            "in.amazon.mShop.android.shopping" to "Amazon Pay"
                        )
                        for ((pkg, fallbackLabel) in knownUpiApps) {
                            if (seen.contains(pkg)) continue
                            if (!isPackageInstalled(pkg)) continue
                            seen.add(pkg)
                            val label = try {
                                val info = packageManager.getApplicationInfo(pkg, 0)
                                packageManager.getApplicationLabel(info).toString()
                            } catch (e: Exception) {
                                fallbackLabel
                            }
                            appList.add(
                                mapOf(
                                    "packageName" to pkg,
                                    "appName" to label
                                )
                            )
                        }

                        result.success(appList)
                    } catch (e: Exception) {
                        result.success(emptyList<Map<String, String>>())
                    }
                }
                "launchUpiPayment" -> {
                    val uriString = call.argument<String>("upiUri")
                    val targetPackage = call.argument<String>("packageName")

                    if (uriString.isNullOrEmpty()) {
                        result.error("INVALID_URI", "UPI URI cannot be null or empty", null)
                        return@setMethodCallHandler
                    }

                    try {
                        val parsedUri = Uri.parse(uriString)
                        val intent = Intent(Intent.ACTION_VIEW, parsedUri)
                        if (!targetPackage.isNullOrEmpty()) {
                            intent.setPackage(targetPackage)
                            if (intent.resolveActivity(packageManager) == null) {
                                intent.setPackage(null)
                            }
                        }

                        pendingUpiResult = result
                        val chooser = if (intent.getPackage().isNullOrEmpty()) {
                            Intent.createChooser(intent, "Pay via UPI App")
                        } else {
                            intent
                        }

                        startActivityForResult(chooser, UPI_PAY_REQ_CODE)
                    } catch (e: Exception) {
                        result.error("LAUNCH_FAILED", e.localizedMessage ?: "Could not open UPI app", null)
                        pendingUpiResult = null
                    }
                }
                "openApp" -> {
                    val packageName = call.argument<String>("packageName") ?: "com.phonepe.app"
                    try {
                        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
                        if (launchIntent != null) {
                            startActivity(launchIntent)
                            result.success(true)
                        } else {
                            // Fallback to general intent
                            val fallback = Intent(Intent.ACTION_VIEW, Uri.parse("upi://pay"))
                            startActivity(fallback)
                            result.success(true)
                        }
                    } catch (e: Exception) {
                        result.error("OPEN_FAILED", e.localizedMessage ?: "Could not open app", null)
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == SMS_PERMISSION_REQ_CODE) {
            val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
            pendingPermissionResult?.success(granted)
            pendingPermissionResult = null
        }
        if (requestCode == CONTACTS_PERMISSION_REQ_CODE) {
            val granted = grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED
            pendingContactsPermissionResult?.success(granted)
            pendingContactsPermissionResult = null
        }
    }

    override fun onDestroy() {
        smsObserver?.let {
            try { contentResolver.unregisterContentObserver(it) } catch (_: Exception) {}
        }
        smsObserver = null
        super.onDestroy()
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == UPI_PAY_REQ_CODE) {
            val responseString = data?.getStringExtra("response") ?: ""
            val resultMap = parseUpiResponse(responseString, data, resultCode)
            pendingUpiResult?.success(resultMap)
            pendingUpiResult = null
        }
    }

    /// Whether a package is present on this device.
    ///
    /// On Android 11+ this only succeeds for packages declared in the
    /// manifest `<queries>` block (Paytm and BHIM both are).
    private fun isPackageInstalled(packageName: String): Boolean {
        return try {
            packageManager.getPackageInfo(packageName, 0)
            true
        } catch (e: android.content.pm.PackageManager.NameNotFoundException) {
            false
        } catch (e: Exception) {
            false
        }
    }

    private fun parseUpiResponse(responseStr: String, data: Intent?, resultCode: Int): Map<String, Any?> {
        val map = mutableMapOf<String, Any?>()
        map["raw"] = responseStr
        map["resultCode"] = resultCode

        if (responseStr.isNotEmpty()) {
            val pairs = responseStr.split("&")
            for (pair in pairs) {
                val kv = pair.split("=")
                if (kv.size == 2) {
                    map[kv[0].lowercase()] = kv[1]
                }
            }
        }

        data?.extras?.let { bundle ->
            val keys = bundle.keySet()
            if (keys != null) {
                for (key in keys) {
                    val value = bundle.get(key)
                    if (value != null && !map.containsKey(key.lowercase())) {
                        map[key.lowercase()] = value.toString()
                    }
                }
            }
        }

        val status = map["status"]?.toString()?.uppercase() ?: ""
        val isExplicitSuccess = status == "SUCCESS"
        val isExplicitFailure = status == "FAILURE" || status == "FAILED"
        val isSuccess = isExplicitSuccess || (resultCode == RESULT_OK && !isExplicitFailure)
        val isFailure = isExplicitFailure
        val isCancelled = !isSuccess && !isFailure

        map["isSuccess"] = isSuccess
        map["isFailure"] = isFailure
        map["isCancelled"] = isCancelled

        return map
    }
}
