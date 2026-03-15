package com.kamyabi.cash.ads.data

import android.app.Activity
import android.content.Context
import android.util.Log
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.firebase.remoteconfig.FirebaseRemoteConfig
import com.unity3d.ads.IUnityAdsInitializationListener
import com.unity3d.ads.IUnityAdsLoadListener
import com.unity3d.ads.IUnityAdsShowListener
import com.unity3d.ads.UnityAds
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.tasks.await
import kotlin.coroutines.resume

/**
 * Ad provider abstraction with real SDK integration.
 * Supports: AdMob, AppLovin, Unity, Meta.
 * Admin panel controls active provider via "Switch Ads" feature.
 */
class AdManager(private val context: Context) {

    companion object {
        private const val TAG = "AdManager"

        // AdMob IDs
        const val ADMOB_APP_ID = "ca-app-pub-4867749522951713~3442061996"
        const val ADMOB_REWARDED_ID = "ca-app-pub-4867749522951713/8624038237"

        // Unity Ads IDs
        const val UNITY_GAME_ID = "6061899"
        const val UNITY_REWARDED_ID = "Rewarded_Android"
    }

    enum class AdProvider {
        ADMOB, APPLOVIN, UNITY, META, ADCOLONY
    }

    private var currentProvider: AdProvider = AdProvider.ADMOB
    private var admobRewardedAd: RewardedAd? = null
    private var unityInitialized = false

    /**
     * Initialize ad SDKs.
     */
    fun initialize() {
        // Initialize AdMob
        MobileAds.initialize(context) { status ->
            Log.d(TAG, "AdMob initialized: $status")
        }

        // Initialize Unity Ads
        UnityAds.initialize(context, UNITY_GAME_ID, false, object : IUnityAdsInitializationListener {
            override fun onInitializationComplete() {
                Log.d(TAG, "Unity Ads initialized")
                unityInitialized = true
            }
            override fun onInitializationFailed(error: UnityAds.UnityAdsInitializationError?, message: String?) {
                Log.e(TAG, "Unity Ads init failed: $message")
            }
        })
    }

    /**
     * Fetches the active ad provider from Remote Config.
     */
    suspend fun fetchActiveProvider(): AdProvider {
        return try {
            val remoteConfig = FirebaseRemoteConfig.getInstance()
            remoteConfig.fetchAndActivate().await()

            val providerStr = remoteConfig.getString("ad_provider")
            currentProvider = when (providerStr.lowercase()) {
                "admob" -> AdProvider.ADMOB
                "applovin" -> AdProvider.APPLOVIN
                "unity" -> AdProvider.UNITY
                "meta" -> AdProvider.META
                "adcolony" -> AdProvider.ADCOLONY
                else -> AdProvider.ADMOB
            }
            currentProvider
        } catch (e: Exception) {
            AdProvider.ADMOB
        }
    }

    fun getActiveProvider(): AdProvider = currentProvider

    /**
     * Shows a rewarded ad for the specified network.
     * Returns true if ad was watched successfully.
     */
    suspend fun showRewardedAd(activity: Activity, network: String = ""): Boolean {
        val provider = if (network.isNotEmpty()) {
            when (network.lowercase()) {
                "admob" -> AdProvider.ADMOB
                "applovin" -> AdProvider.APPLOVIN
                "unity" -> AdProvider.UNITY
                "meta" -> AdProvider.META
                else -> currentProvider
            }
        } else {
            currentProvider
        }

        return when (provider) {
            AdProvider.ADMOB -> showAdMobRewardedAd(activity)
            AdProvider.UNITY -> showUnityRewardedAd(activity)
            AdProvider.APPLOVIN -> showAppLovinRewardedAd(activity)
            AdProvider.META -> showMetaRewardedAd(activity)
            AdProvider.ADCOLONY -> showAdColonyRewardedAd(activity)
        }
    }

    /**
     * Preloads AdMob rewarded ad for faster display.
     */
    fun preloadAdMob() {
        val adRequest = AdRequest.Builder().build()
        RewardedAd.load(context, ADMOB_REWARDED_ID, adRequest, object : RewardedAdLoadCallback() {
            override fun onAdLoaded(ad: RewardedAd) {
                admobRewardedAd = ad
                Log.d(TAG, "AdMob rewarded ad loaded")
            }
            override fun onAdFailedToLoad(error: LoadAdError) {
                admobRewardedAd = null
                Log.e(TAG, "AdMob load failed: ${error.message}")
            }
        })
    }

    private suspend fun showAdMobRewardedAd(activity: Activity): Boolean =
        suspendCancellableCoroutine { cont ->
            val ad = admobRewardedAd
            if (ad == null) {
                // Try loading first
                val adRequest = AdRequest.Builder().build()
                RewardedAd.load(context, ADMOB_REWARDED_ID, adRequest, object : RewardedAdLoadCallback() {
                    override fun onAdLoaded(loadedAd: RewardedAd) {
                        showAdMobAdInternal(activity, loadedAd) { result ->
                            if (cont.isActive) cont.resume(result)
                        }
                    }
                    override fun onAdFailedToLoad(error: LoadAdError) {
                        Log.e(TAG, "AdMob load failed: ${error.message}")
                        if (cont.isActive) cont.resume(false)
                    }
                })
            } else {
                admobRewardedAd = null
                showAdMobAdInternal(activity, ad) { result ->
                    if (cont.isActive) cont.resume(result)
                }
                preloadAdMob() // Preload next
            }
        }

    private fun showAdMobAdInternal(activity: Activity, ad: RewardedAd, callback: (Boolean) -> Unit) {
        var rewarded = false
        ad.fullScreenContentCallback = object : FullScreenContentCallback() {
            override fun onAdDismissedFullScreenContent() {
                callback(rewarded)
            }
            override fun onAdFailedToShowFullScreenContent(error: AdError) {
                callback(false)
            }
        }
        ad.show(activity) { rewardItem ->
            rewarded = true
            Log.d(TAG, "AdMob reward: ${rewardItem.amount} ${rewardItem.type}")
        }
    }

    private suspend fun showUnityRewardedAd(activity: Activity): Boolean =
        suspendCancellableCoroutine { cont ->
            if (!unityInitialized) {
                if (cont.isActive) cont.resume(false)
                return@suspendCancellableCoroutine
            }

            UnityAds.load(UNITY_REWARDED_ID, object : IUnityAdsLoadListener {
                override fun onUnityAdsAdLoaded(placementId: String?) {
                    UnityAds.show(activity, UNITY_REWARDED_ID, object : IUnityAdsShowListener {
                        override fun onUnityAdsShowComplete(placementId: String?, state: UnityAds.UnityAdsShowCompletionState?) {
                            val success = state == UnityAds.UnityAdsShowCompletionState.COMPLETED
                            if (cont.isActive) cont.resume(success)
                        }
                        override fun onUnityAdsShowFailure(placementId: String?, error: UnityAds.UnityAdsShowError?, message: String?) {
                            Log.e(TAG, "Unity show failed: $message")
                            if (cont.isActive) cont.resume(false)
                        }
                        override fun onUnityAdsShowStart(placementId: String?) {}
                        override fun onUnityAdsShowClick(placementId: String?) {}
                    })
                }
                override fun onUnityAdsFailedToLoad(placementId: String?, error: UnityAds.UnityAdsLoadError?, message: String?) {
                    Log.e(TAG, "Unity load failed: $message")
                    if (cont.isActive) cont.resume(false)
                }
            })
        }

    private suspend fun showAppLovinRewardedAd(activity: Activity): Boolean {
        // AppLovin SDK integration placeholder — will be added when IDs are provided
        Log.d(TAG, "AppLovin ad requested (SDK not yet integrated)")
        return false
    }

    private suspend fun showMetaRewardedAd(activity: Activity): Boolean {
        // Meta Audience Network integration placeholder — will be added when IDs are provided
        Log.d(TAG, "Meta ad requested (SDK not yet integrated)")
        return false
    }

    private suspend fun showAdColonyRewardedAd(activity: Activity): Boolean {
        Log.d(TAG, "AdColony ad requested (SDK not yet integrated)")
        return false
    }
}
