package com.kamyabi.cash.tasks.ui

import android.app.AlertDialog
import android.media.MediaPlayer
import android.os.Bundle
import android.os.CountDownTimer
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.kamyabi.cash.R
import com.kamyabi.cash.core.di.ServiceLocator
import com.kamyabi.cash.tasks.data.TaskRepository
import kotlinx.coroutines.launch

class TierTasksFragment : Fragment() {

    companion object {
        const val ARG_TIER = "tier"
    }

    enum class Tier(
        val titleRes: Int,
        val disclaimerRes: Int,
        val colorRes: Int,
        val taskKeys: List<String>,
        val network: String
    ) {
        SILVER(
            R.string.silver_section_title,
            R.string.silver_disclaimer,
            R.color.tier_silver,
            listOf("task_1", "task_2", "task_3", "task_4", "task_8", "task_9", "task_10", "task_11", "task_12"),
            "admob"
        ),
        GOLD(
            R.string.gold_section_title,
            R.string.gold_disclaimer,
            R.color.tier_gold,
            listOf("task_7"),
            "unity"
        ),
        DIAMOND(
            R.string.diamond_section_title,
            R.string.diamond_disclaimer,
            R.color.tier_diamond,
            listOf("task_5", "task_6"),
            "applovin"
        ),
        ELITE(
            R.string.elite_section_title,
            R.string.elite_disclaimer,
            R.color.tier_elite,
            listOf("meta_1", "meta_2", "meta_3", "meta_4", "meta_5"),
            "meta"
        )
    }

    // Task types that require watching an ad
    private val adTaskTypes = setOf("task_1", "task_2", "task_5", "task_6", "task_7",
        "meta_1", "meta_2", "meta_3", "meta_4", "meta_5")

    // Task-to-network mapping
    private val taskNetworkMap = mapOf(
        "task_1" to "admob", "task_2" to "admob",
        "task_5" to "applovin", "task_6" to "applovin",
        "task_7" to "unity",
        "meta_1" to "meta", "meta_2" to "meta", "meta_3" to "meta",
        "meta_4" to "meta", "meta_5" to "meta"
    )

    // Task labels (title + reward string resources)
    private val taskLabels = mapOf(
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
        "meta_1" to Pair(R.string.meta_1_title, R.string.meta_1_reward),
        "meta_2" to Pair(R.string.meta_2_title, R.string.meta_2_reward),
        "meta_3" to Pair(R.string.meta_3_title, R.string.meta_3_reward),
        "meta_4" to Pair(R.string.meta_4_title, R.string.meta_4_reward),
        "meta_5" to Pair(R.string.meta_5_title, R.string.meta_5_reward),
    )

    private val taskRepo = TaskRepository()
    private val adManager get() = ServiceLocator.adManager

    private lateinit var tier: Tier
    private lateinit var taskContainer: LinearLayout
    private lateinit var tvCooldown: TextView

    private data class TaskCardViews(
        val title: TextView,
        val reward: TextView,
        val button: Button
    )

    private val taskCards = mutableMapOf<String, TaskCardViews>()
    private var cooldownTimer: CountDownTimer? = null
    private val taskTimers = mutableListOf<CountDownTimer>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val tierName = arguments?.getString(ARG_TIER) ?: "SILVER"
        tier = Tier.valueOf(tierName)
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_tier_tasks, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val tvTitle = view.findViewById<TextView>(R.id.tvTierTitle)
        val tvDisclaimer = view.findViewById<TextView>(R.id.tvTierDisclaimer)
        val btnBack = view.findViewById<TextView>(R.id.btnBack)
        tvCooldown = view.findViewById(R.id.tvTierCooldown)
        taskContainer = view.findViewById(R.id.taskContainer)

        tvTitle.text = getString(tier.titleRes)
        tvTitle.setTextColor(resources.getColor(tier.colorRes, null))
        tvDisclaimer.text = getString(tier.disclaimerRes)

        btnBack.setOnClickListener { findNavController().navigateUp() }

        buildTaskCards()
        loadData()
    }

    private fun buildTaskCards() {
        val inflater = LayoutInflater.from(requireContext())
        for (taskKey in tier.taskKeys) {
            val cardView = inflater.inflate(R.layout.item_task_card, taskContainer, false)
            val views = TaskCardViews(
                title = cardView.findViewById(R.id.tvTaskTitle),
                reward = cardView.findViewById(R.id.tvTaskReward),
                button = cardView.findViewById(R.id.btnTaskAction)
            )

            // Set labels
            taskLabels[taskKey]?.let { (titleRes, rewardRes) ->
                views.title.text = getString(titleRes)
                views.reward.text = getString(rewardRes)
            }

            // Set click handler
            when (taskKey) {
                "task_4" -> views.button.setOnClickListener { spinWheel(views.button) }
                "task_8" -> views.button.setOnClickListener { scratchCard(views.button) }
                else -> views.button.setOnClickListener { claimTask(taskKey, views.button) }
            }

            // Add margin
            val params = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            params.topMargin = resources.getDimensionPixelSize(R.dimen.spacing_sm)
            cardView.layoutParams = params

            taskContainer.addView(cardView)
            taskCards[taskKey] = views
        }
    }

    private fun loadData() {
        viewLifecycleOwner.lifecycleScope.launch {
            taskRepo.getTaskStatus().onSuccess { status ->
                updateTaskUI(status)
            }
        }
    }

    private fun updateTaskUI(status: com.kamyabi.cash.core.network.TaskStatusResponse) {
        val progress = status.taskProgress
        val metaProgress = status.meta?.metaProgress

        for ((key, card) in taskCards) {
            val taskStatus = if (key.startsWith("meta_")) metaProgress?.get(key) else progress[key]
            updateTaskButton(card.button, taskStatus)
        }

        // Show cooldown for this tier's network
        val cooldownAt = when (tier) {
            Tier.SILVER -> status.networkCooldowns?.get("admob")
            Tier.GOLD -> status.networkCooldowns?.get("unity")
            Tier.DIAMOND -> status.networkCooldowns?.get("applovin")
            Tier.ELITE -> status.meta?.nextMetaAt
        }
        startCooldownTimer(cooldownAt)
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
            val network = taskNetworkMap[taskType]
            if (network != null && taskType in adTaskTypes) {
                val adWatched = adManager.showRewardedAd(requireActivity(), network)
                if (!adWatched) {
                    Toast.makeText(context, "Please watch the full ad to claim this task", Toast.LENGTH_SHORT).show()
                    button.isEnabled = true
                    return@launch
                }
            }

            taskRepo.claimTask(taskType).onSuccess { response ->
                showResultDialog(
                    title = "Task Complete!",
                    icon = "\uD83C\uDF89",
                    prize = response.reward,
                    winMessage = "+${response.reward?.toInt()} Coins earned!"
                )
                // Lock this task button immediately
                button.text = getString(R.string.task_completed)
                button.isEnabled = false
                button.alpha = 0.5f
                // Refresh all task states
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
                    winMessage = getString(R.string.spin_result_win, result.prize?.toInt()?.toString() ?: "0")
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
                    winMessage = getString(R.string.scratch_result_win, result.prize?.toInt()?.toString() ?: "0")
                )
                loadData()
            }.onFailure { e ->
                Toast.makeText(context, e.message, Toast.LENGTH_SHORT).show()
                button.isEnabled = true
            }
        }
    }

    private fun showResultDialog(title: String, icon: String, prize: Double?, winMessage: String) {
        val ctx = context ?: return
        val isWin = prize != null && prize > 0
        val message = if (isWin) winMessage else "Try again next cycle!"

        if (isWin) {
            try {
                val mp = MediaPlayer.create(context, R.raw.coin_collect)
                mp?.setOnCompletionListener { it.release() }
                mp?.start()
            } catch (_: Exception) { }
        }

        AlertDialog.Builder(ctx, R.style.Theme_KamyabiCash_Dialog)
            .setTitle("$icon $title")
            .setMessage("\n$message\n")
            .setPositiveButton("OK", null)
            .show()
    }

    private fun startCooldownTimer(nextAt: Long?) {
        cooldownTimer?.cancel()
        if (nextAt == null || nextAt <= 0) {
            tvCooldown.visibility = View.GONE
            return
        }
        val remaining = nextAt - System.currentTimeMillis()
        if (remaining <= 0) {
            tvCooldown.visibility = View.GONE
            return
        }

        tvCooldown.visibility = View.VISIBLE
        cooldownTimer = object : CountDownTimer(remaining, 1000) {
            override fun onTick(millisUntilFinished: Long) {
                val h = millisUntilFinished / (1000 * 60 * 60)
                val m = (millisUntilFinished % (1000 * 60 * 60)) / (1000 * 60)
                val s = (millisUntilFinished % (1000 * 60)) / 1000
                tvCooldown.text = if (h > 0) "Cooldown: ${h}h ${m}m ${s}s" else "Cooldown: ${m}m ${s}s"
            }
            override fun onFinish() {
                tvCooldown.visibility = View.GONE
                loadData()
            }
        }.start()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        cooldownTimer?.cancel()
        taskTimers.forEach { it.cancel() }
    }
}
