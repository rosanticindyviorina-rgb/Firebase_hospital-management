package com.kamyabi.cash.wallet.ui

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
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

class WithdrawFragment : Fragment() {

    private val walletRepo = WalletRepository()
    private var selectedMethod = "easypaisa"
    private var currentBalance = 0.0

    private lateinit var tvSelectedMethod: TextView
    private lateinit var tvMethodDesc: TextView
    private lateinit var tvMethodIcon: TextView
    private lateinit var methodIconFrame: FrameLayout
    private lateinit var etWithdrawAmount: EditText
    private lateinit var etAccountNumber: EditText
    private lateinit var etAccountName: EditText
    private lateinit var labelAccountName: TextView
    private lateinit var tvAvailableBalance: TextView
    private lateinit var tvFee: TextView
    private lateinit var tvReceiveAmount: TextView
    private lateinit var btnSubmitWithdraw: Button

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_withdraw, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        selectedMethod = arguments?.getString("method") ?: "easypaisa"
        bindViews(view)
        setupMethod()
        setupAmountWatcher()
        loadBalance()

        btnSubmitWithdraw.setOnClickListener { submitWithdrawal() }
    }

    private fun bindViews(view: View) {
        tvSelectedMethod = view.findViewById(R.id.tvSelectedMethod)
        tvMethodDesc = view.findViewById(R.id.tvMethodDesc)
        tvMethodIcon = view.findViewById(R.id.tvMethodIcon)
        methodIconFrame = view.findViewById(R.id.methodIconFrame)
        etWithdrawAmount = view.findViewById(R.id.etWithdrawAmount)
        etAccountNumber = view.findViewById(R.id.etAccountNumber)
        etAccountName = view.findViewById(R.id.etAccountName)
        labelAccountName = view.findViewById(R.id.labelAccountName)
        tvAvailableBalance = view.findViewById(R.id.tvAvailableBalance)
        tvFee = view.findViewById(R.id.tvFee)
        tvReceiveAmount = view.findViewById(R.id.tvReceiveAmount)
        btnSubmitWithdraw = view.findViewById(R.id.btnSubmitWithdraw)
    }

    private fun setupMethod() {
        when (selectedMethod) {
            "easypaisa" -> {
                tvSelectedMethod.text = getString(R.string.method_easypaisa)
                tvMethodDesc.text = "Mobile wallet transfer"
                tvMethodIcon.text = "EP"
                methodIconFrame.setBackgroundColor(resources.getColor(R.color.easypaisa_green, null))
                labelAccountName.text = getString(R.string.withdraw_name_label)
                etAccountName.hint = getString(R.string.withdraw_name_hint)
                etAccountNumber.hint = "+92 3XX XXXXXXX"
            }
            "jazzcash" -> {
                tvSelectedMethod.text = getString(R.string.method_jazzcash)
                tvMethodDesc.text = "Mobile wallet transfer"
                tvMethodIcon.text = "JC"
                methodIconFrame.setBackgroundColor(resources.getColor(R.color.jazzcash_red, null))
                labelAccountName.text = getString(R.string.withdraw_name_label)
                etAccountName.hint = getString(R.string.withdraw_name_hint)
                etAccountNumber.hint = "+92 3XX XXXXXXX"
            }
            "usdt" -> {
                tvSelectedMethod.text = getString(R.string.method_usdt)
                tvMethodDesc.text = "TRON network (TRC-20)"
                tvMethodIcon.text = "\u20AE"
                methodIconFrame.setBackgroundColor(resources.getColor(R.color.usdt_teal, null))
                labelAccountName.visibility = View.GONE
                etAccountName.visibility = View.GONE
                etAccountNumber.hint = getString(R.string.withdraw_wallet_hint)
                etAccountNumber.inputType = android.text.InputType.TYPE_CLASS_TEXT
            }
        }
    }

    private fun setupAmountWatcher() {
        etWithdrawAmount.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                calculateFees()
            }
        })
    }

    private fun calculateFees() {
        val amount = etWithdrawAmount.text.toString().toDoubleOrNull() ?: 0.0
        val fee = if (selectedMethod == "usdt") amount * 0.02 else 0.0
        val receive = amount - fee

        val formatter = NumberFormat.getNumberInstance(Locale.US)
        tvFee.text = if (selectedMethod == "usdt") "USDT ${formatter.format(fee)}" else "PKR 0"
        tvReceiveAmount.text = if (selectedMethod == "usdt") {
            "USDT ${formatter.format(receive)}"
        } else {
            "PKR ${formatter.format(receive)}"
        }
    }

    private fun loadBalance() {
        val uid = FirebaseAuth.getInstance().currentUser?.uid ?: return
        viewLifecycleOwner.lifecycleScope.launch {
            walletRepo.getBalance(uid)?.let { wallet ->
                currentBalance = wallet.balance
                val formatter = NumberFormat.getNumberInstance(Locale.US)
                tvAvailableBalance.text = "Available: PKR ${formatter.format(wallet.balance)}"
            }
        }
    }

    private fun submitWithdrawal() {
        val amount = etWithdrawAmount.text.toString().toDoubleOrNull()
        val account = etAccountNumber.text.toString().trim()
        val name = etAccountName.text.toString().trim()

        // Validation
        if (amount == null || amount < 500) {
            Toast.makeText(context, "Minimum withdrawal is PKR 500", Toast.LENGTH_SHORT).show()
            return
        }
        if (amount > currentBalance) {
            Toast.makeText(context, "Insufficient balance", Toast.LENGTH_SHORT).show()
            return
        }
        if (account.isEmpty()) {
            Toast.makeText(context, "Enter account number", Toast.LENGTH_SHORT).show()
            return
        }
        if (selectedMethod != "usdt" && name.isEmpty()) {
            Toast.makeText(context, "Enter account holder name", Toast.LENGTH_SHORT).show()
            return
        }

        btnSubmitWithdraw.isEnabled = false
        btnSubmitWithdraw.text = "Processing..."

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val payload = mapOf(
                    "method" to selectedMethod,
                    "amount" to amount.toString(),
                    "accountNumber" to account,
                    "accountName" to name
                )
                val response = ServiceLocator.apiClient.withdrawalApi.requestWithdrawal(payload)
                if (response.success) {
                    Toast.makeText(context, "Withdrawal requested successfully!", Toast.LENGTH_LONG).show()
                    parentFragmentManager.popBackStack()
                } else {
                    Toast.makeText(context, response.error ?: "Request failed", Toast.LENGTH_SHORT).show()
                    btnSubmitWithdraw.isEnabled = true
                    btnSubmitWithdraw.text = getString(R.string.withdraw_submit)
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                btnSubmitWithdraw.isEnabled = true
                btnSubmitWithdraw.text = getString(R.string.withdraw_submit)
            }
        }
    }
}
