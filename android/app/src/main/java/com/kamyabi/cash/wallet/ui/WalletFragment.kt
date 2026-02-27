package com.kamyabi.cash.wallet.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.firebase.auth.FirebaseAuth
import com.kamyabi.cash.R
import com.kamyabi.cash.wallet.data.LedgerEntry
import com.kamyabi.cash.wallet.data.WalletRepository
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class WalletFragment : Fragment() {

    private val walletRepo = WalletRepository()

    private lateinit var tvWalletBalance: TextView
    private lateinit var rvTransactions: RecyclerView
    private lateinit var tvNoTransactions: TextView

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_wallet, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        tvWalletBalance = view.findViewById(R.id.tvWalletBalance)
        rvTransactions = view.findViewById(R.id.rvTransactions)
        tvNoTransactions = view.findViewById(R.id.tvNoTransactions)

        // Payment method cards — navigate to withdraw
        view.findViewById<View>(R.id.cardEasypaisa).setOnClickListener {
            navigateToWithdraw("easypaisa")
        }
        view.findViewById<View>(R.id.cardJazzcash).setOnClickListener {
            navigateToWithdraw("jazzcash")
        }
        view.findViewById<View>(R.id.cardUsdt).setOnClickListener {
            navigateToWithdraw("usdt")
        }

        rvTransactions.layoutManager = LinearLayoutManager(context)

        loadData()
    }

    private fun navigateToWithdraw(method: String) {
        val bundle = Bundle().apply { putString("method", method) }
        findNavController().navigate(R.id.action_wallet_to_withdraw, bundle)
    }

    private fun loadData() {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return

        viewLifecycleOwner.lifecycleScope.launch {
            // Load balance
            walletRepo.getBalance(uid)?.let { wallet ->
                val formatter = NumberFormat.getNumberInstance(Locale.US)
                tvWalletBalance.text = "PKR ${formatter.format(wallet.balance)}"
            }

            // Load transactions
            val entries = walletRepo.getLedgerEntries(uid)
            if (entries.isEmpty()) {
                rvTransactions.visibility = View.GONE
                tvNoTransactions.visibility = View.VISIBLE
            } else {
                rvTransactions.visibility = View.VISIBLE
                tvNoTransactions.visibility = View.GONE
                rvTransactions.adapter = TransactionAdapter(entries)
            }
        }
    }

    // Inner adapter for transaction list
    inner class TransactionAdapter(private val items: List<LedgerEntry>) :
        RecyclerView.Adapter<TransactionAdapter.ViewHolder>() {

        inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
            val tvIcon: TextView = view.findViewById(R.id.tvTxIcon)
            val tvTitle: TextView = view.findViewById(R.id.tvTxTitle)
            val tvDate: TextView = view.findViewById(R.id.tvTxDate)
            val tvAmount: TextView = view.findViewById(R.id.tvTxAmount)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context).inflate(R.layout.item_transaction, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val entry = items[position]

            // Icon based on type
            holder.tvIcon.text = when (entry.type) {
                "task_reward" -> "\u25B6" // play icon
                "referral_commission" -> "\u2B50" // star
                "spin_reward" -> "\uD83C\uDFB0" // slot
                "withdrawal" -> "\u2B07" // down arrow
                else -> "\u25CF"
            }

            // Title
            holder.tvTitle.text = when (entry.type) {
                "task_reward" -> "Task Reward (${entry.taskType ?: ""})"
                "referral_commission" -> "Referral Commission (${entry.level ?: ""})"
                "spin_reward" -> "Spin Reward"
                "withdrawal" -> "Withdrawal"
                else -> entry.type
            }

            // Date
            val dateFormat = SimpleDateFormat("MMM dd, HH:mm", Locale.US)
            holder.tvDate.text = dateFormat.format(Date(entry.createdAt))

            // Amount
            val formatter = NumberFormat.getNumberInstance(Locale.US)
            val prefix = if (entry.amount >= 0) "+" else ""
            holder.tvAmount.text = "${prefix}PKR ${formatter.format(entry.amount)}"
        }

        override fun getItemCount() = items.size
    }
}
