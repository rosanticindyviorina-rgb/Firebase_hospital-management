package com.kamyabi.cash.tasks.ui

import android.os.Bundle
import android.os.CountDownTimer
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
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
    private lateinit var tvTotalEarned: TextView
    private lateinit var tvCycleTimer: TextView
    private lateinit var tvReferralCode: TextView
    private lateinit var btnWithdraw: Button
    private lateinit var btnShareCode: Button

    // Task card views
    private lateinit var task1Title: TextView
    private lateinit var task1Reward: TextView
    private lateinit var task1Btn: Button
    private lateinit var task2Title: TextView
    private lateinit var task2Reward: TextView
    private lateinit var task2Btn: Button
    private lateinit var task3Title: TextView
    private lateinit var task3Reward: TextView
    private lateinit var task3Btn: Button
    private lateinit var task4Title: TextView
    private lateinit var task4Reward: TextView
    private lateinit var task4Btn: Button

    private var cycleTimer: CountDownTimer? = null
    private var cooldownTimer: CountDownTimer? = null
    private lateinit var tvCooldownTimer: TextView

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_home, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        bindViews(view)
        setupClickListeners()
        loadData()
    }

    private fun bindViews(view: View) {
        tvGreeting = view.findViewById(R.id.tvGreeting)
        tvBalance = view.findViewById(R.id.tvBalance)
        tvTotalEarned = view.findViewById(R.id.tvTotalEarned)
        tvCycleTimer = view.findViewById(R.id.tvCycleTimer)
        tvReferralCode = view.findViewById(R.id.tvReferralCode)
        btnWithdraw = view.findViewById(R.id.btnWithdraw)
        btnShareCode = view.findViewById(R.id.btnShareCode)

        tvCooldownTimer = view.findViewById(R.id.tvCooldownTimer)

        // Task cards
        val task1Card = view.findViewById<View>(R.id.task1Card)
        task1Title = task1Card.findViewById(R.id.tvTaskTitle)
        task1Reward = task1Card.findViewById(R.id.tvTaskReward)
        task1Btn = task1Card.findViewById(R.id.btnTaskAction)

        val task2Card = view.findViewById<View>(R.id.task2Card)
        task2Title = task2Card.findViewById(R.id.tvTaskTitle)
        task2Reward = task2Card.findViewById(R.id.tvTaskReward)
        task2Btn = task2Card.findViewById(R.id.btnTaskAction)

        val task3Card = view.findViewById<View>(R.id.task3Card)
        task3Title = task3Card.findViewById(R.id.tvTaskTitle)
        task3Reward = task3Card.findViewById(R.id.tvTaskReward)
        task3Btn = task3Card.findViewById(R.id.btnTaskAction)

        val task4Card = view.findViewById<View>(R.id.task4Card)
        task4Title = task4Card.findViewById(R.id.tvTaskTitle)
        task4Reward = task4Card.findViewById(R.id.tvTaskReward)
        task4Btn = task4Card.findViewById(R.id.btnTaskAction)

        // Set static task info
        task1Title.text = getString(R.string.task_1_title)
        task1Reward.text = getString(R.string.task_1_reward)
        task2Title.text = getString(R.string.task_2_title)
        task2Reward.text = getString(R.string.task_2_reward)
        task3Title.text = getString(R.string.task_3_title)
        task3Reward.text = getString(R.string.task_3_reward)
        task4Title.text = getString(R.string.task_4_title)
        task4Reward.text = getString(R.string.task_4_reward)
    }

    private fun setupClickListeners() {
        task1Btn.setOnClickListener { claimTask("task_1", task1Btn) }
        task2Btn.setOnClickListener { claimTask("task_2", task2Btn) }
        task3Btn.setOnClickListener { claimTask("task_3", task3Btn) }
        task4Btn.setOnClickListener { spinWheel(task4Btn) }

        btnWithdraw.setOnClickListener {
            // Navigate to wallet tab
            activity?.let { act ->
                val navView = act.findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottomNav)
                navView?.selectedItemId = R.id.nav_wallet
            }
        }

        btnShareCode.setOnClickListener { shareReferralCode() }
    }

    private fun loadData() {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return

        viewLifecycleOwner.lifecycleScope.launch {
            // Load balance
            walletRepo.getBalance(uid)?.let { wallet ->
                val formatter = NumberFormat.getNumberInstance(Locale.US)
                tvBalance.text = formatter.format(wallet.balance)
                tvTotalEarned.text = "PKR ${formatter.format(wallet.totalEarned)}"
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

        updateTaskButton(task1Btn, progress["task_1"])
        updateTaskButton(task2Btn, progress["task_2"])
        updateTaskButton(task3Btn, progress["task_3"])
        updateTaskButton(task4Btn, progress["task_4"])

        // Start 3-minute cooldown timer if active
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
            // Show ad first for ad tasks
            if (taskType == "task_1" || taskType == "task_2") {
                adManager.showRewardedAd(requireActivity())
            }

            taskRepo.claimTask(taskType).onSuccess { response ->
                Toast.makeText(context, "+${response.reward?.toInt()} PKR", Toast.LENGTH_SHORT).show()
                loadData() // Refresh
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
                val message = if (result.prize != null && result.prize > 0) {
                    getString(R.string.spin_result_win, result.prize.toInt().toString())
                } else {
                    getString(R.string.spin_result_try_again)
                }
                Toast.makeText(context, message, Toast.LENGTH_LONG).show()
                loadData()
            }.onFailure { e ->
                Toast.makeText(context, e.message, Toast.LENGTH_SHORT).show()
                button.isEnabled = true
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
                loadData() // Refresh task availability
            }
        }.start()
    }

    private fun shareReferralCode() {
        val code = tvReferralCode.text.toString()
        val shareText = "Join Kamyabi Cash and earn daily! Use my referral code: $code\nDownload: https://play.google.com/store/apps/details?id=com.kamyabi.cash"
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
    }
}
