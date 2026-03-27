package com.kamyabi.cash.tasks.ui

import android.app.AlertDialog
import android.media.MediaPlayer
import android.os.Bundle
import android.os.CountDownTimer
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.os.bundleOf
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.viewpager2.widget.ViewPager2
import com.google.firebase.auth.FirebaseAuth
import com.kamyabi.cash.R
import com.kamyabi.cash.core.di.ServiceLocator
import com.kamyabi.cash.tasks.data.TaskRepository
import com.kamyabi.cash.wallet.data.WalletRepository
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

class HomeFragment : Fragment() {

    private val taskRepo = TaskRepository()
    private val walletRepo = WalletRepository()
    private val adManager get() = ServiceLocator.adManager

    private lateinit var tvGreeting: TextView
    private lateinit var tvBalance: TextView
    private lateinit var tvBalancePkr: TextView
    private lateinit var tvTotalEarned: TextView
    private lateinit var tvCycleTimer: TextView
    private lateinit var tvReferralCode: TextView
    private lateinit var btnWithdraw: Button
    private lateinit var btnTransfer: Button
    private lateinit var btnRedeemCode: Button
    private lateinit var btnShareCode: Button

    // Loyalty views
    private lateinit var tvLoyaltyReward: TextView
    private lateinit var btnLoyaltyClaim: Button

    // Ad watch count
    private lateinit var tvAdWatchCount: TextView
    private var dailyAdLimit = 8

    // Exchange rate
    private var exchangeRateCoins = 2000
    private var exchangeRatePkr = 50

    private var cycleTimer: CountDownTimer? = null
    private var cooldownTimer: CountDownTimer? = null
    private lateinit var tvCooldownTimer: TextView

    // Per-network cooldown timers on tier cards
    private lateinit var tvSilverCooldown: TextView
    private lateinit var tvGoldCooldown: TextView
    private lateinit var tvDiamondCooldown: TextView
    private lateinit var tvEliteCooldown: TextView
    private val networkTimers = mutableListOf<CountDownTimer>()

    // Banner slider
    private lateinit var bannerPager: ViewPager2
    private lateinit var bannerIndicator: LinearLayout
    private val bannerHandler = Handler(Looper.getMainLooper())
    private val bannerAutoScroll = object : Runnable {
        override fun run() {
            if (::bannerPager.isInitialized) {
                bannerPager.currentItem = bannerPager.currentItem + 1
                bannerHandler.postDelayed(this, 4000)
            }
        }
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_home, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        bindViews(view)
        setupBannerSlider(view)
        setupClickListeners()
        fetchConfig()
        loadData()
    }

    private fun bindViews(view: View) {
        tvGreeting = view.findViewById(R.id.tvGreeting)
        tvBalance = view.findViewById(R.id.tvBalance)
        tvBalancePkr = view.findViewById(R.id.tvBalancePkr)
        tvTotalEarned = view.findViewById(R.id.tvTotalEarned)
        tvCycleTimer = view.findViewById(R.id.tvCycleTimer)
        tvReferralCode = view.findViewById(R.id.tvReferralCode)
        btnWithdraw = view.findViewById(R.id.btnWithdraw)
        btnTransfer = view.findViewById(R.id.btnTransfer)
        btnRedeemCode = view.findViewById(R.id.btnRedeemCode)
        btnShareCode = view.findViewById(R.id.btnShareCode)
        tvCooldownTimer = view.findViewById(R.id.tvCooldownTimer)
        tvAdWatchCount = view.findViewById(R.id.tvAdWatchCount)

        // Loyalty views
        tvLoyaltyReward = view.findViewById(R.id.tvLoyaltyReward)
        btnLoyaltyClaim = view.findViewById(R.id.btnLoyaltyClaim)

        // Per-network cooldown on tier cards
        tvSilverCooldown = view.findViewById(R.id.tvSilverCooldown)
        tvGoldCooldown = view.findViewById(R.id.tvGoldCooldown)
        tvDiamondCooldown = view.findViewById(R.id.tvDiamondCooldown)
        tvEliteCooldown = view.findViewById(R.id.tvEliteCooldown)
    }

    private fun setupBannerSlider(view: View) {
        bannerPager = view.findViewById(R.id.bannerPager)
        bannerIndicator = view.findViewById(R.id.bannerIndicator)

        val banners = listOf(
            BannerItem(R.drawable.banner_silver),
            BannerItem(R.drawable.banner_gold),
            BannerItem(R.drawable.banner_diamond),
            BannerItem(R.drawable.banner_elite),
            BannerItem(R.drawable.banner_withdraw),
            BannerItem(R.drawable.banner_transfer),
            BannerItem(R.drawable.banner_gaming),
            BannerItem(R.drawable.banner_social),
            BannerItem(R.drawable.banner_redeem),
        )

        val adapter = BannerAdapter(banners)
        bannerPager.adapter = adapter

        val startPos = Int.MAX_VALUE / 2 - (Int.MAX_VALUE / 2 % banners.size)
        bannerPager.setCurrentItem(startPos, false)

        buildIndicatorDots(banners.size, 0)

        bannerPager.registerOnPageChangeCallback(object : ViewPager2.OnPageChangeCallback() {
            override fun onPageSelected(position: Int) {
                buildIndicatorDots(banners.size, position % banners.size)
            }
        })

        bannerHandler.postDelayed(bannerAutoScroll, 4000)
    }

    private fun buildIndicatorDots(count: Int, activeIndex: Int) {
        bannerIndicator.removeAllViews()
        for (i in 0 until count) {
            val dot = View(requireContext()).apply {
                val size = resources.getDimensionPixelSize(R.dimen.spacing_xs)
                layoutParams = LinearLayout.LayoutParams(size, size).apply {
                    marginStart = 4
                    marginEnd = 4
                }
                setBackgroundResource(
                    if (i == activeIndex) R.drawable.dot_indicator_active
                    else R.drawable.dot_indicator_inactive
                )
            }
            bannerIndicator.addView(dot)
        }
    }

    private fun setupClickListeners() {
        // Tier card navigation
        view?.findViewById<View>(R.id.cardSilver)?.setOnClickListener { openTier("SILVER") }
        view?.findViewById<View>(R.id.cardGold)?.setOnClickListener { openTier("GOLD") }
        view?.findViewById<View>(R.id.cardDiamond)?.setOnClickListener { openTier("DIAMOND") }
        view?.findViewById<View>(R.id.cardElite)?.setOnClickListener { openTier("ELITE") }

        // Loyalty claim
        btnLoyaltyClaim.setOnClickListener { claimLoyalty() }

        // Redeem code
        btnRedeemCode.setOnClickListener { showRedeemDialog() }

        // Withdraw — switch to Wallet tab
        btnWithdraw.setOnClickListener {
            activity?.let { act ->
                val navView = act.findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottomNav)
                navView?.selectedItemId = R.id.nav_wallet
            }
        }

        // Transfer — navigate to transfer fragment
        btnTransfer.setOnClickListener {
            findNavController().navigate(R.id.transferFragment)
        }

        btnShareCode.setOnClickListener { shareReferralCode() }
    }

    private fun openTier(tierName: String) {
        val bundle = bundleOf(TierTasksFragment.ARG_TIER to tierName)
        findNavController().navigate(R.id.tierTasksFragment, bundle)
    }

    private fun fetchConfig() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val config = ServiceLocator.apiClient.configApi.getConfig()
                exchangeRateCoins = config.exchange_rate_coins
                exchangeRatePkr = config.exchange_rate_pkr
                dailyAdLimit = config.daily_ad_limit
            } catch (_: Exception) {}
        }
    }

    private fun coinsToPkr(coins: Double): Double {
        return if (exchangeRateCoins > 0) (coins / exchangeRateCoins) * exchangeRatePkr else 0.0
    }

    private fun loadData() {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return

        viewLifecycleOwner.lifecycleScope.launch {
            val formatter = NumberFormat.getNumberInstance(Locale.US)

            // Load balance
            walletRepo.getBalance(uid)?.let { wallet ->
                val coins = wallet.coinBalance.toLong()
                tvBalance.text = "${formatter.format(coins)} Coins"
                tvTotalEarned.text = "${formatter.format(wallet.totalCoinsEarned.toLong())} Coins"
                tvBalancePkr.text = "= PKR ${formatter.format(coinsToPkr(wallet.coinBalance).toLong())}"
            }

            // Load profile for referral code
            try {
                val profile = ServiceLocator.apiClient.userApi.getProfile()
                tvReferralCode.text = profile.referralCode
                tvGreeting.text = "Welcome back!"
            } catch (_: Exception) {}

            // Load task status for timers & cooldowns
            taskRepo.getTaskStatus().onSuccess { status ->
                updateTimers(status)
            }
        }
    }

    private fun updateTimers(status: com.kamyabi.cash.core.network.TaskStatusResponse) {
        // Loyalty
        val loyalty = status.loyalty
        if (loyalty?.claimedToday == true) {
            btnLoyaltyClaim.text = getString(R.string.loyalty_claimed)
            btnLoyaltyClaim.isEnabled = false
            btnLoyaltyClaim.alpha = 0.5f
        } else {
            btnLoyaltyClaim.text = getString(R.string.task_claim)
            btnLoyaltyClaim.isEnabled = true
            btnLoyaltyClaim.alpha = 1.0f
        }

        val todayReward = loyalty?.todayReward ?: run {
            val day = java.util.Calendar.getInstance().get(java.util.Calendar.DAY_OF_MONTH)
            when {
                day <= 10 -> 20
                day <= 20 -> 30
                else -> 45
            }
        }
        tvLoyaltyReward.text = getString(R.string.loyalty_reward_today, todayReward.toString())

        val streak = loyalty?.loyaltyStreak ?: 0
        if (streak > 0) {
            tvLoyaltyReward.text = "${tvLoyaltyReward.text} | ${getString(R.string.loyalty_streak, streak.toString())}"
        }

        // Ad watch count
        val adCount = status.adWatchCount
        if (adCount > 0 || dailyAdLimit > 0) {
            tvAdWatchCount.visibility = View.VISIBLE
            tvAdWatchCount.text = "Ads today: $adCount / $dailyAdLimit"
        }

        startCycleTimer(status.nextCycleAt)
        startCooldownTimer(status.nextTaskAt)

        // Per-network cooldowns on tier cards
        cancelNetworkTimers()
        startNetworkCooldown(tvSilverCooldown, status.networkCooldowns?.get("admob"))
        startNetworkCooldown(tvGoldCooldown, status.networkCooldowns?.get("unity"))
        startNetworkCooldown(tvDiamondCooldown, status.networkCooldowns?.get("applovin"))
        startNetworkCooldown(tvEliteCooldown, status.meta?.nextMetaAt)
    }

    private fun cancelNetworkTimers() {
        networkTimers.forEach { it.cancel() }
        networkTimers.clear()
    }

    private fun startNetworkCooldown(tv: TextView, nextAt: Long?) {
        if (nextAt == null || nextAt <= 0) {
            tv.visibility = View.GONE
            return
        }
        val remaining = nextAt - System.currentTimeMillis()
        if (remaining <= 0) {
            tv.visibility = View.GONE
            return
        }
        tv.visibility = View.VISIBLE
        val timer = object : CountDownTimer(remaining, 1000) {
            override fun onTick(millisUntilFinished: Long) {
                val h = millisUntilFinished / (1000 * 60 * 60)
                val m = (millisUntilFinished % (1000 * 60 * 60)) / (1000 * 60)
                val s = (millisUntilFinished % (1000 * 60)) / 1000
                tv.text = if (h > 0) "Cooldown: ${h}h ${m}m ${s}s" else "Cooldown: ${m}m ${s}s"
            }
            override fun onFinish() {
                tv.visibility = View.GONE
            }
        }.start()
        networkTimers.add(timer)
    }

    private fun claimLoyalty() {
        btnLoyaltyClaim.isEnabled = false
        viewLifecycleOwner.lifecycleScope.launch {
            val adWatched = adManager.showRewardedAd(requireActivity(), "admob")
            if (!adWatched) {
                Toast.makeText(context, "Please watch the ad to claim your daily reward", Toast.LENGTH_SHORT).show()
                btnLoyaltyClaim.isEnabled = true
                return@launch
            }

            taskRepo.claimLoyalty().onSuccess { result ->
                showResultDialog(
                    title = getString(R.string.loyalty_title),
                    icon = "\uD83C\uDF1F",
                    prize = result.reward,
                    winMessage = "+${result.reward?.toInt()} Coins! Streak: ${result.streakDay} days",
                    loseMessage = "Already claimed today"
                )
                loadData()
            }.onFailure { e ->
                Toast.makeText(context, e.message, Toast.LENGTH_SHORT).show()
                btnLoyaltyClaim.isEnabled = true
            }
        }
    }

    private fun showRedeemDialog() {
        val ctx = context ?: return
        val input = EditText(ctx).apply {
            hint = getString(R.string.redeem_hint)
            setPadding(48, 32, 48, 32)
        }

        AlertDialog.Builder(ctx, R.style.Theme_KamyabiCash_Dialog)
            .setTitle(getString(R.string.redeem_title))
            .setView(input)
            .setPositiveButton(getString(R.string.redeem_submit)) { _, _ ->
                val code = input.text.toString().trim().uppercase()
                if (code.isNotEmpty()) {
                    redeemCode(code)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun redeemCode(code: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            taskRepo.claimRedeemCode(code).onSuccess { result ->
                showResultDialog(
                    title = getString(R.string.redeem_title),
                    icon = "\uD83C\uDF81",
                    prize = result.coinsAwarded,
                    winMessage = getString(R.string.redeem_success, result.coinsAwarded?.toInt()?.toString() ?: "0"),
                    loseMessage = "Redeem failed"
                )
                loadData()
            }.onFailure { e ->
                Toast.makeText(context, e.message, Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun showResultDialog(title: String, icon: String, prize: Double?, winMessage: String, loseMessage: String) {
        val ctx = context ?: return
        val isWin = prize != null && prize > 0
        val message = if (isWin) winMessage else loseMessage

        if (isWin) {
            try {
                val mp = MediaPlayer.create(context, R.raw.coin_collect)
                mp?.setOnCompletionListener { it.release() }
                mp?.start()
            } catch (_: Exception) { }
            try {
                val anim = AnimationUtils.loadAnimation(context, R.anim.coin_sparkle)
                tvBalance.startAnimation(anim)
            } catch (_: Exception) { }
        }

        AlertDialog.Builder(ctx, R.style.Theme_KamyabiCash_Dialog)
            .setTitle("$icon $title")
            .setMessage("\n$message\n")
            .setPositiveButton("OK", null)
            .show()
    }

    private fun startCycleTimer(nextCycleAt: Long) {
        cycleTimer?.cancel()
        val remaining = nextCycleAt - System.currentTimeMillis()
        if (remaining <= 0) {
            tvCycleTimer.text = getString(R.string.daily_tasks)
            return
        }

        cycleTimer = object : CountDownTimer(remaining, 1000) {
            override fun onTick(millisUntilFinished: Long) {
                val hours = millisUntilFinished / (1000 * 60 * 60)
                val minutes = (millisUntilFinished % (1000 * 60 * 60)) / (1000 * 60)
                val seconds = (millisUntilFinished % (1000 * 60)) / 1000
                tvCycleTimer.text = "${getString(R.string.cycle_resets_in)} ${hours}h ${minutes}m ${seconds}s"
            }

            override fun onFinish() {
                tvCycleTimer.text = getString(R.string.daily_tasks)
                loadData()
            }
        }.start()
    }

    private fun startCooldownTimer(nextTaskAt: Long) {
        cooldownTimer?.cancel()
        val remaining = nextTaskAt - System.currentTimeMillis()
        if (remaining <= 0) {
            tvCooldownTimer.visibility = View.GONE
            return
        }

        tvCooldownTimer.visibility = View.VISIBLE
        cooldownTimer = object : CountDownTimer(remaining, 1000) {
            override fun onTick(millisUntilFinished: Long) {
                val minutes = millisUntilFinished / (1000 * 60)
                val seconds = (millisUntilFinished % (1000 * 60)) / 1000
                tvCooldownTimer.text = "Next task in: ${minutes}m ${seconds}s"
            }

            override fun onFinish() {
                tvCooldownTimer.visibility = View.GONE
                loadData()
            }
        }.start()
    }

    private fun shareReferralCode() {
        val code = tvReferralCode.text.toString()
        val shareText = "Join Kamyabi Cash and earn daily! Use my referral code: $code\nDownload: https://play.google.com/store/apps/details?id=com.taskforge.app"
        val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(android.content.Intent.EXTRA_TEXT, shareText)
        }
        startActivity(android.content.Intent.createChooser(intent, getString(R.string.share_code)))
    }

    override fun onDestroyView() {
        super.onDestroyView()
        cycleTimer?.cancel()
        cooldownTimer?.cancel()
        cancelNetworkTimers()
        bannerHandler.removeCallbacks(bannerAutoScroll)
    }
}
