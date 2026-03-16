package com.kamyabi.cash.wallet.ui

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.google.firebase.auth.FirebaseAuth
import com.kamyabi.cash.R
import com.kamyabi.cash.core.di.ServiceLocator
import com.kamyabi.cash.wallet.data.WalletRepository
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

class TransferFragment : Fragment() {

    private val walletRepo = WalletRepository()
    private var currentCoinBalance = 0.0

    // Exchange rate: default 2000 coins = 50 PKR
    private var exchangeRateCoins = 2000
    private var exchangeRatePkr = 50
    private val platformFeePercent = 0.10
    private val minTransferCoins = 3000

    private lateinit var etRecipientId: EditText
    private lateinit var etTransferAmount: EditText
    private lateinit var tvTransferFee: TextView
    private lateinit var tvTransferReceive: TextView
    private lateinit var tvTransferBalance: TextView
    private lateinit var btnSubmitTransfer: Button

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_transfer, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        bindViews(view)
        setupAmountWatcher()
        fetchConfig()
        loadBalance()

        btnSubmitTransfer.setOnClickListener { submitTransfer() }
    }

    private fun bindViews(view: View) {
        etRecipientId = view.findViewById(R.id.etRecipientId)
        etTransferAmount = view.findViewById(R.id.etTransferAmount)
        tvTransferFee = view.findViewById(R.id.tvTransferFee)
        tvTransferReceive = view.findViewById(R.id.tvTransferReceive)
        tvTransferBalance = view.findViewById(R.id.tvTransferBalance)
        btnSubmitTransfer = view.findViewById(R.id.btnSubmitTransfer)
    }

    private fun fetchConfig() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val config = ServiceLocator.apiClient.configApi.getConfig()
                exchangeRateCoins = config.exchange_rate_coins
                exchangeRatePkr = config.exchange_rate_pkr
                loadBalance()
            } catch (_: Exception) {}
        }
    }

    private fun setupAmountWatcher() {
        etTransferAmount.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                calculateFees()
            }
        })
    }

    private fun calculateFees() {
        val coinAmount = etTransferAmount.text.toString().toLongOrNull() ?: 0L
        val fee = (coinAmount * platformFeePercent).toLong()
        val recipientReceives = coinAmount - fee

        val formatter = NumberFormat.getNumberInstance(Locale.US)
        tvTransferFee.text = "${formatter.format(fee)} Coins"
        tvTransferReceive.text = "${formatter.format(recipientReceives)} Coins"
    }

    private fun loadBalance() {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        viewLifecycleOwner.lifecycleScope.launch {
            walletRepo.getBalance(uid)?.let { wallet ->
                currentCoinBalance = wallet.coinBalance
                val formatter = NumberFormat.getNumberInstance(Locale.US)
                val coins = wallet.coinBalance.toLong()
                val pkr = if (exchangeRateCoins > 0) (wallet.coinBalance / exchangeRateCoins) * exchangeRatePkr else 0.0
                tvTransferBalance.text = "Available: ${formatter.format(coins)} Coins (PKR ${formatter.format(pkr.toLong())})"
            }
        }
    }

    private fun submitTransfer() {
        val recipientId = etRecipientId.text.toString().trim()
        val coinAmount = etTransferAmount.text.toString().toLongOrNull()

        // Validation
        if (recipientId.isEmpty()) {
            Toast.makeText(context, "Enter recipient User ID or Referral Code", Toast.LENGTH_SHORT).show()
            return
        }
        if (coinAmount == null || coinAmount < minTransferCoins) {
            Toast.makeText(context, "Minimum transfer is $minTransferCoins Coins", Toast.LENGTH_SHORT).show()
            return
        }
        if (coinAmount > currentCoinBalance) {
            Toast.makeText(context, "Insufficient coin balance", Toast.LENGTH_SHORT).show()
            return
        }

        btnSubmitTransfer.isEnabled = false
        btnSubmitTransfer.text = "Sending..."

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val payload = mapOf(
                    "recipientId" to recipientId,
                    "coinAmount" to coinAmount.toString()
                )
                val response = ServiceLocator.apiClient.transferApi.transferCoins(payload)
                if (response.success) {
                    val formatter = NumberFormat.getNumberInstance(Locale.US)
                    Toast.makeText(
                        context,
                        "Sent ${formatter.format(response.recipientReceived?.toLong() ?: 0)} coins successfully!",
                        Toast.LENGTH_LONG
                    ).show()
                    parentFragmentManager.popBackStack()
                } else {
                    Toast.makeText(context, response.error ?: "Transfer failed", Toast.LENGTH_SHORT).show()
                    btnSubmitTransfer.isEnabled = true
                    btnSubmitTransfer.text = "Send Coins"
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                btnSubmitTransfer.isEnabled = true
                btnSubmitTransfer.text = "Send Coins"
            }
        }
    }
}
