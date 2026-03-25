package com.kamyabi.cash.wallet.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ProgressBar
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.kamyabi.cash.R
import com.kamyabi.cash.core.di.ServiceLocator
import com.kamyabi.cash.core.network.TaskHistoryItem
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class TaskHistoryFragment : Fragment() {

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_task_history, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        view.findViewById<View>(R.id.btnBack).setOnClickListener {
            findNavController().popBackStack()
        }

        val rv = view.findViewById<RecyclerView>(R.id.rvHistory)
        val progress = view.findViewById<ProgressBar>(R.id.progressBar)
        val tvEmpty = view.findViewById<TextView>(R.id.tvEmpty)

        rv.layoutManager = LinearLayoutManager(requireContext())

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ServiceLocator.apiClient.accountApi.getTaskHistory(50)
                progress.visibility = View.GONE

                if (response.history.isEmpty()) {
                    tvEmpty.visibility = View.VISIBLE
                } else {
                    rv.adapter = TaskHistoryAdapter(response.history)
                }
            } catch (e: Exception) {
                progress.visibility = View.GONE
                tvEmpty.text = "Failed to load: ${e.message}"
                tvEmpty.visibility = View.VISIBLE
            }
        }
    }

    private class TaskHistoryAdapter(private val items: List<TaskHistoryItem>) :
        RecyclerView.Adapter<TaskHistoryAdapter.VH>() {

        private val dateFormat = SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.US)

        class VH(view: View) : RecyclerView.ViewHolder(view) {
            val tvIcon: TextView = view.findViewById(R.id.tvIcon)
            val tvType: TextView = view.findViewById(R.id.tvType)
            val tvDate: TextView = view.findViewById(R.id.tvDate)
            val tvAmount: TextView = view.findViewById(R.id.tvAmount)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_task_history, parent, false)
            return VH(view)
        }

        override fun getItemCount() = items.size

        override fun onBindViewHolder(holder: VH, position: Int) {
            val item = items[position]

            val (icon, label) = getTypeDisplay(item.type)
            holder.tvIcon.text = icon
            holder.tvType.text = label

            if (item.createdAt > 0) {
                holder.tvDate.text = dateFormat.format(Date(item.createdAt))
            } else {
                holder.tvDate.text = ""
            }

            val isNegative = item.type in listOf("withdrawal", "transfer_sent")
            val sign = if (isNegative) "-" else "+"
            val color = if (isNegative) 0xFFFF5252.toInt() else 0xFF00C853.toInt()
            holder.tvAmount.text = "$sign${item.amount.toLong()} KC"
            holder.tvAmount.setTextColor(color)
        }

        private fun getTypeDisplay(type: String): Pair<String, String> = when (type) {
            "task_reward" -> "\uD83C\uDFAF" to "Task Reward"
            "meta_task_reward" -> "\uD83C\uDFC6" to "Meta Task Reward"
            "referral_commission" -> "\uD83D\uDC65" to "Referral Commission"
            "invite_bonus" -> "\uD83C\uDF89" to "Invite Bonus"
            "spin_reward" -> "\uD83C\uDFA1" to "Spin Reward"
            "scratch_reward" -> "\uD83C\uDFB0" to "Scratch Reward"
            "loyalty_reward" -> "\u2B50" to "Loyalty Reward"
            "redeem_code" -> "\uD83C\uDF81" to "Redeem Code"
            "withdrawal" -> "\uD83D\uDCB8" to "Withdrawal"
            "transfer_sent" -> "\u27A1\uFE0F" to "Transfer Sent"
            "transfer_received" -> "\u2B05\uFE0F" to "Transfer Received"
            "gaming_reward" -> "\uD83C\uDFAE" to "Gaming Reward"
            else -> "\uD83D\uDCB0" to type.replace("_", " ").replaceFirstChar { it.uppercase() }
        }
    }
}
