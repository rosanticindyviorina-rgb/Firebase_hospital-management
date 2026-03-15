package com.kamyabi.cash.tasks.ui

import android.app.AlertDialog
import android.os.Bundle
import android.os.CountDownTimer
import android.os.Handler
import android.os.Looper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
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
    private lateinit var btnShareCode: Button

    // Loyalty views
    private lateinit var tvLoyaltyReward: TextView
    private lateinit var btnLoyaltyClaim: Button

    // Redeem code button
    private lateinit var btnRedeemCode: Button

    // Exchange rate: default 2000 coins = 50 PKR
    private var exchangeRateCoins = 2000
    private var exchangeRatePkr = 50

    // Task card views — data class for convenience
    private data class TaskCardViews(
        val title: TextView,
        val reward: TextView,
        val button: Button
    )

    private val taskCards = mutableMapOf<String, TaskCardViews>()
    private val metaCards = mutableMapOf<String, TaskCardViews>()

    private var cycleTimer: CountDownTimer? = null
    private var cooldownTimer: CountDownTimer? = null
    private lateinit var tvCooldownTimer: TextView

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

    // Ad task types (tasks that require watching an ad)
    private val adTaskTypes = setOf("task_1", "task_2", "task_5", "task_6", "task_7")
    // Meta task types
    private val metaTaskTypes = setOf("meta_1", "meta_2", "meta_3", "meta_4", "meta_5")

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
        btnShareCode = view.findViewById(R.id.btnShareCode)
        tvCooldownTimer = view.findViewById(R.id.tvCooldownTimer)

        // Loyalty views
        tvLoyaltyReward = view.findViewById(R.id.tvLoyaltyReward)
        btnLoyaltyClaim = view.findViewById(R.id.btnLoyaltyClaim)

        // Redeem code
        btnRedeemCode = view.findViewById(R.id.btnRedeemCode)

        // Bind all 12 task cards
        val cardIds = mapOf(
            "task_1" to R.id.task1Card,
            "task_2" to R.id.task2Card,
            "task_3" to R.id.task3Card,
            "task_4" to R.id.task4Card,
            "task_5" to R.id.task5Card,
            "task_6" to R.id.task6Card,
            "task_7" to R.id.task7Card,
            "task_8" to R.id.task8Card,
            "task_9" to R.id.task9Card,
            "task_10" to R.id.task10Card,
            "task_11" to R.id.task11Card,
            "task_12" to R.id.task12Card,
        )

        for ((key, cardId) in cardIds) {
            val card = view.findViewById<View>(cardId)
            taskCards[key] = TaskCardViews(
                title = card.findViewById(R.id.tvTaskTitle),
                reward = card.findViewById(R.id.tvTaskReward),
                button = card.findViewById(R.id.btnTaskAction)
            )
        }

        // Set static task labels
        val taskLabels = mapOf(
            "task_1" to Pair(R.string.task_1_title, R.string.task_1_reward),
            "task_2" to Pair(R.string.task_2_title, R.string.task_2_reward),
            "task_3" to Pair(R.string.task_3_title, R.string.task_3_reward),
            "task_4" to Pair(R.string.task_4_title, R.string.task_4_reward),
            "task_5" to Pair(R.string.task_5_title, R.string.task_5_reward),
            "task_6" to Pair(R.string.task_6_title, R.string.task_6_reward),
            "task_7" to Pair(R.string.task_7_title, R.string.task_7_reward),
            "task_8" to Pair(R.string.task_8_title, R.string.task_8_reward),
            "task_9" to Pair(R.string.task_9_title, R.string.task_9_reward),
            "task_10" to Pair(R.string.task_10_title, R.string.task_10_reward),
            "task_11" to Pair(R.string.task_11_title, R.string.task_11_reward),
            "task_12" to Pair(R.string.task_12_title, R.string.task_12_reward),
        )

        for ((key, labels) in taskLabels) {
            taskCards[key]?.let { card ->
                card.title.text = getString(labels.first)
                card.reward.text = getString(labels.second)
            }
        }

        // Bind meta task cards
        val metaCardIds = mapOf(
            "meta_1" to R.id.meta1Card,
            "meta_2" to R.id.meta2Card,
            "meta_3" to R.id.meta3Card,
            "meta_4" to R.id.meta4Card,
            "meta_5" to R.id.meta5Card,
        )

        for ((key, cardId) in metaCardIds) {
            val card = view.findViewById<View>(cardId)
            metaCards[key] = TaskCardViews(
                title = card.findViewById(R.id.tvTaskTitle),
                reward = card.findViewById(R.id.tvTaskReward),
                button = card.findViewById(R.id.btnTaskAction)
            )
        }

        // Set meta task labels
        val metaLabels = mapOf(
            "meta_1" to Pair(R.string.meta_1_title, R.string.meta_1_reward),
            "meta_2" to Pair(R.string.meta_2_title, R.string.meta_2_reward),
            "meta_3" to Pair(R.string.meta_3_title, R.string.meta_3_reward),
            "meta_4" to Pair(R.string.meta_4_title, R.string.meta_4_reward),
            "meta_5" to Pair(R.string.meta_5_title, R.string.meta_5_reward),
        )

        for ((key, labels) in metaLabels) {
            metaCards[key]?.let { card ->
                card.title.text = getString(labels.first)
                card.reward.text = getString(labels.second)
            }
        }
    }

    private fun setupBannerSlider(view: View) {
        bannerPager = view.findViewById(R.id.bannerPager)
        bannerIndicator = view.findViewById(R.id.bannerIndicator)

        val banners = listOf(
            BannerItem("\uD83D\uDCB0", "Earn 50 Coins Per Task", "Complete daily tasks & grow your balance", R.drawable.bg_banner_1),
            BannerItem("\uD83D\uDC65", "Invite 15 Friends", "Unlock the 400 Coin Invite Challenge reward", R.drawable.bg_banner_2),
            BannerItem("\uD83C\uDFA1", "Spin & Win Up To 199 Coins", "Try your luck on the daily spin wheel", R.drawable.bg_banner_3),
            BannerItem("\uD83D\uDCB3", "Withdraw via EasyPaisa", "Cash out to EasyPaisa, JazzCash or USDT", R.drawable.bg_banner_4),
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
        // Ad tasks (1, 2, 5, 6, 7)
        for (taskType in adTaskTypes) {
            taskCards[taskType]?.button?.setOnClickListener { claimTask(taskType, it as Button) }
        }

        // Invite tasks (3, 9, 10, 11, 12) — server validates invite count
        for (taskType in listOf("task_3", "task_9", "task_10", "task_11", "task_12")) {
            taskCards[taskType]?.button?.setOnClickListener { claimTask(taskType, it as Button) }
        }

        // Spin wheel (task 4)
        taskCards["task_4"]?.button?.setOnClickListener { spinWheel(it as Button) }

        // Scratch card (task 8)
        taskCards["task_8"]?.button?.setOnClickListener { scratchCard(it as Button) }

        // Meta tasks — ad-gated, claim via same endpoint
        for (taskType in metaTaskTypes) {
            metaCards[taskType]?.button?.setOnClickListener { claimTask(taskType, it as Button) }
        }

        // Loyalty claim
        btnLoyaltyClaim.setOnClickListener { claimLoyalty() }

        // Redeem code
        btnRedeemCode.setOnClickListener { showRedeemDialog() }

        btnWithdraw.setOnClickListener {
            activity?.let { act ->
                val navView = act.findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottomNav)
                navView?.selectedItemId = R.id.nav_wallet
            }
        }

        btnShareCode.setOnClickListener { shareReferralCode() }
    }

    private fun fetchConfig() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val config = ServiceLocator.apiClient.configApi.getConfig()
                exchangeRateCoins = config.exchange_rate_coins
                exchangeRatePkr = config.exchange_rate_pkr
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

            // Load task status
            taskRepo.getTaskStatus().onSuccess { status ->
                updateTaskUI(status)
                startCycleTimer(status.nextCycleAt)
            }
        }
    }

    private fun updateTaskUI(status: com.kamyabi.cash.core.network.TaskStatusResponse) {
        val progress = status.taskProgress

        // Update core task buttons
        for ((key, card) in taskCards) {
            updateTaskButton(card.button, progress[key])
        }

        // Update meta task buttons from meta status
        val metaProgress = status.meta?.metaProgress
        for ((key, card) in metaCards) {
            updateTaskButton(card.button, metaProgress?.get(key))
        }

        // Update loyalty from server status
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

        // Set loyalty reward text from server or calculate locally
        val todayReward = loyalty?.todayReward ?: run {
            val day = java.util.Calendar.getInstance().get(java.util.Calendar.DAY_OF_MONTH)
            when {
                day <= 10 -> 20
                day <= 20 -> 30
                else -> 45
            }
        }
        tvLoyaltyReward.text = getString(R.string.loyalty_reward_today, todayReward.toString())

        // Show streak if available
        val streak = loyalty?.loyaltyStreak ?: 0
        if (streak > 0) {
            tvLoyaltyReward.text = "${tvLoyaltyReward.text} | ${getString(R.string.loyalty_streak, streak.toString())}"
        }

        startCooldownTimer(status.nextTaskAt)
    }

    private fun updateTaskButton(button: Button, status: String?) {
        when (status) {
            "completed" -> {
                button.text = getString(R.string.task_completed)
                button.isEnabled = false
                button.alpha = 0.5f
            }
            "locked" -> {
                button.text = getString(R.string.task_locked)
                button.isEnabled = false
                button.alpha = 0.5f
            }
            else -> {
                button.text = getString(R.string.task_claim)
                button.isEnabled = true
                button.alpha = 1.0f
            }
        }
    }

    private fun claimTask(taskType: String, button: Button) {
        button.isEnabled = false
        viewLifecycleOwner.lifecycleScope.launch {
            // Show ad first for ad tasks and meta tasks
            if (taskType in adTaskTypes || taskType in metaTaskTypes) {
                adManager.showRewardedAd(requireActivity())
            }

            taskRepo.claimTask(taskType).onSuccess { response ->
                Toast.makeText(context, "+${response.reward?.toInt()} Coins", Toast.LENGTH_SHORT).show()
                loadData()
            }.onFailure { e ->
                Toast.makeText(context, e.message, Toast.LENGTH_SHORT).show()
                button.isEnabled = true
            }
        }
    }

    private fun spinWheel(button: Button) {
        button.isEnabled = false
        viewLifecycleOwner.lifecycleScope.launch {
            taskRepo.executeSpin().onSuccess { result ->
                showResultDialog(
                    title = getString(R.string.spin_title),
                    icon = "\uD83C\uDFA1",
                    prize = result.prize,
                    winMessage = getString(R.string.spin_result_win, result.prize?.toInt()?.toString() ?: "0"),
                    loseMessage = getString(R.string.spin_result_try_again)
                )
                loadData()
            }.onFailure { e ->
                Toast.makeText(context, e.message, Toast.LENGTH_SHORT).show()
                button.isEnabled = true
            }
        }
    }

    private fun scratchCard(button: Button) {
        button.isEnabled = false
        viewLifecycleOwner.lifecycleScope.launch {
            taskRepo.executeScratch().onSuccess { result ->
                showResultDialog(
                    title = getString(R.string.scratch_title),
                    icon = "\uD83C\uDFAB",
                    prize = result.prize,
                    winMessage = getString(R.string.scratch_result_win, result.prize?.toInt()?.toString() ?: "0"),
                    loseMessage = getString(R.string.spin_result_try_again)
                )
                loadData()
            }.onFailure { e ->
                Toast.makeText(context, e.message, Toast.LENGTH_SHORT).show()
                button.isEnabled = true
            }
        }
    }

    private fun showResultDialog(title: String, icon: String, prize: Double?, winMessage: String, loseMessage: String) {
        val ctx = context ?: return
        val isWin = prize != null && prize > 0
        val message = if (isWin) winMessage else loseMessage

        AlertDialog.Builder(ctx, R.style.Theme_KamyabiCash_Dialog)
            .setTitle("$icon $title")
            .setMessage("\n$message\n")
            .setPositiveButton("OK", null)
            .show()
    }

    private fun claimLoyalty() {
        btnLoyaltyClaim.isEnabled = false
        viewLifecycleOwner.lifecycleScope.launch {
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
        bannerHandler.removeCallbacks(bannerAutoScroll)
    }
}
