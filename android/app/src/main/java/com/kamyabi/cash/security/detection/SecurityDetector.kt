package com.kamyabi.cash.security.detection

import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Debug
import android.provider.Settings
import java.io.File
import java.net.NetworkInterface

/**
 * On-device security detection engine.
 * Checks for: root, emulator, clone/parallel space, VPN, hooking/debugging.
 *
 * IMPORTANT: Client detects → Server confirms → Ban is server-authoritative.
 * These checks are a first line of defense; the server makes the final decision.
 */
class SecurityDetector(private val context: Context) {

    data class SecurityReport(
        val violations: List<String>,
        val deviceFingerprint: Map<String, String>,
        val isClean: Boolean
    )

    /**
     * Runs all security checks and returns a consolidated report.
     */
    fun runFullCheck(): SecurityReport {
        val violations = mutableListOf<String>()

        if (isRooted()) violations.add("root")
        if (isEmulator()) violations.add("emulator")
        if (isCloneOrParallelSpace()) violations.add("clone")
        if (isVpnActive()) violations.add("vpn")
        if (isDebugged()) violations.add("hooking")

        return SecurityReport(
            violations = violations,
            deviceFingerprint = collectDeviceFingerprint(),
            isClean = violations.isEmpty()
        )
    }

    // ============================================
    // ROOT DETECTION
    // ============================================
    fun isRooted(): Boolean {
        return checkRootBinaries() || checkSuBinary() || checkRootPackages()
    }

    private fun checkRootBinaries(): Boolean {
        val paths = arrayOf(
            "/system/bin/su", "/system/xbin/su", "/sbin/su",
            "/system/su", "/system/bin/.ext/.su",
            "/system/usr/we-need-root/su-backup",
            "/system/app/Superuser.apk", "/system/app/SuperSU.apk",
            "/data/local/su", "/data/local/bin/su", "/data/local/xbin/su"
        )
        return paths.any { File(it).exists() }
    }

    private fun checkSuBinary(): Boolean {
        return try {
            val process = Runtime.getRuntime().exec(arrayOf("/system/xbin/which", "su"))
            process.inputStream.bufferedReader().readLine() != null
        } catch (e: Exception) {
            false
        }
    }

    private fun checkRootPackages(): Boolean {
        val rootPackages = arrayOf(
            "com.noshufou.android.su", "com.thirdparty.superuser",
            "eu.chainfire.supersu", "com.koushikdutta.superuser",
            "com.zachspong.temprootremovejb", "com.ramdroid.appquarantine",
            "com.topjohnwu.magisk"
        )
        val pm = context.packageManager
        return rootPackages.any {
            try {
                pm.getPackageInfo(it, 0)
                true
            } catch (e: PackageManager.NameNotFoundException) {
                false
            }
        }
    }

    // ============================================
    // EMULATOR DETECTION
    // ============================================
    fun isEmulator(): Boolean {
        return (Build.FINGERPRINT.startsWith("generic")
                || Build.FINGERPRINT.startsWith("unknown")
                || Build.MODEL.contains("google_sdk")
                || Build.MODEL.contains("Emulator")
                || Build.MODEL.contains("Android SDK built for x86")
                || Build.MANUFACTURER.contains("Genymotion")
                || Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic")
                || "google_sdk" == Build.PRODUCT
                || Build.HARDWARE.contains("goldfish")
                || Build.HARDWARE.contains("ranchu")
                || Build.BOARD.lowercase().contains("nox")
                || Build.BOOTLOADER.lowercase().contains("nox")
                || Build.SERIAL.lowercase().contains("nox")
                || Build.PRODUCT.lowercase().contains("vbox")
                || Build.PRODUCT.lowercase().contains("sdk_gphone"))
    }

    // ============================================
    // CLONE / PARALLEL SPACE DETECTION
    // ============================================
    fun isCloneOrParallelSpace(): Boolean {
        return checkClonePackages() || checkDataDirectory()
    }

    private fun checkClonePackages(): Boolean {
        val clonePackages = arrayOf(
            "com.lbe.parallel.intl", "com.parallel.space",
            "com.excelliance.dualaid", "com.ludashi.dualspace",
            "com.polestar.super.clone", "com.applisto.appcloner",
            "com.qihoo.magic", "com.bly.dualapp",
            "com.excelliance.multiaccounts", "in.parallel.space"
        )
        val pm = context.packageManager
        return clonePackages.any {
            try {
                pm.getPackageInfo(it, 0)
                true
            } catch (e: PackageManager.NameNotFoundException) {
                false
            }
        }
    }

    private fun checkDataDirectory(): Boolean {
        // In cloned/parallel space apps, the data directory is different
        val dataDir = context.filesDir.absolutePath
        // Normal: /data/user/0/com.kamyabi.cash
        // Cloned: /data/user/999/com.kamyabi.cash or similar
        return !dataDir.contains("/data/user/0/") && !dataDir.contains("/data/data/")
    }

    // ============================================
    // VPN DETECTION
    // ============================================
    fun isVpnActive(): Boolean {
        return checkVpnInterface() || checkConnectivityManager()
    }

    private fun checkVpnInterface(): Boolean {
        return try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (iface.isUp && (iface.name.startsWith("tun") || iface.name.startsWith("ppp")
                            || iface.name.startsWith("pptp"))) {
                    return true
                }
            }
            false
        } catch (e: Exception) {
            false
        }
    }

    private fun checkConnectivityManager(): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val activeNetwork = cm.activeNetwork ?: return false
        val capabilities = cm.getNetworkCapabilities(activeNetwork) ?: return false
        return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
    }

    // ============================================
    // HOOKING / DEBUGGING DETECTION
    // ============================================
    fun isDebugged(): Boolean {
        return Debug.isDebuggerConnected()
                || checkFridaLibs()
                || checkXposedFramework()
    }

    private fun checkFridaLibs(): Boolean {
        return try {
            val maps = File("/proc/self/maps").readText()
            maps.contains("frida") || maps.contains("gadget")
        } catch (e: Exception) {
            false
        }
    }

    private fun checkXposedFramework(): Boolean {
        return try {
            Class.forName("de.robv.android.xposed.XposedBridge")
            true
        } catch (e: ClassNotFoundException) {
            false
        }
    }

    // ============================================
    // DEVICE FINGERPRINT
    // ============================================
    fun collectDeviceFingerprint(): Map<String, String> {
        return mapOf(
            "androidId" to Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID),
            "buildFingerprint" to Build.FINGERPRINT,
            "buildModel" to Build.MODEL,
            "buildManufacturer" to Build.MANUFACTURER,
            "buildBrand" to Build.BRAND,
            "buildDevice" to Build.DEVICE,
            "buildProduct" to Build.PRODUCT,
            "sdkVersion" to Build.VERSION.SDK_INT.toString(),
            "screenResolution" to "${context.resources.displayMetrics.widthPixels}x${context.resources.displayMetrics.heightPixels}",
            "installerPackage" to (context.packageManager.getInstallerPackageName(context.packageName) ?: "unknown"),
        )
    }
}
