package com.kamyabi.cash.wallet.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.kamyabi.cash.R
import com.kamyabi.cash.core.di.ServiceLocator
import kotlinx.coroutines.launch

class BankBindingFragment : Fragment() {

    private lateinit var cardBoundStatus: View
    private lateinit var formBinding: View
    private lateinit var spinnerMethod: Spinner
    private lateinit var etAccountTitle: EditText
    private lateinit var etAccountNumber: EditText
    private lateinit var etBankName: EditText
    private lateinit var btnSaveBinding: Button

    private val methods = listOf("easypaisa", "jazzcash", "bank", "usdt")
    private val methodLabels = listOf("EasyPaisa", "JazzCash", "Bank Transfer", "USDT (Crypto)")

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_bank_binding, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        cardBoundStatus = view.findViewById(R.id.cardBoundStatus)
        formBinding = view.findViewById(R.id.formBinding)
        spinnerMethod = view.findViewById(R.id.spinnerMethod)
        etAccountTitle = view.findViewById(R.id.etAccountTitle)
        etAccountNumber = view.findViewById(R.id.etAccountNumber)
        etBankName = view.findViewById(R.id.etBankName)
        btnSaveBinding = view.findViewById(R.id.btnSaveBinding)

        view.findViewById<View>(R.id.btnBack).setOnClickListener {
            findNavController().popBackStack()
        }

        setupMethodSpinner()
        loadExistingBinding()

        btnSaveBinding.setOnClickListener { saveBinding() }
    }

    private fun setupMethodSpinner() {
        val adapter = ArrayAdapter(requireContext(), android.R.layout.simple_spinner_item, methodLabels)
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerMethod.adapter = adapter
    }

    private fun loadExistingBinding() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ServiceLocator.apiClient.accountApi.getBankBinding()
                if (response.bound) {
                    // Show bound status, hide form
                    cardBoundStatus.visibility = View.VISIBLE
                    formBinding.visibility = View.GONE

                    view?.findViewById<TextView>(R.id.tvBoundTitle)?.text = response.accountTitle
                    view?.findViewById<TextView>(R.id.tvBoundAccount)?.text = response.accountNumber
                    view?.findViewById<TextView>(R.id.tvBoundBank)?.text = response.bankName
                    view?.findViewById<TextView>(R.id.tvBoundMethod)?.text = response.method?.uppercase()
                } else {
                    cardBoundStatus.visibility = View.GONE
                    formBinding.visibility = View.VISIBLE
                }
            } catch (_: Exception) {
                // Show form on error (assume not bound)
                cardBoundStatus.visibility = View.GONE
                formBinding.visibility = View.VISIBLE
            }
        }
    }

    private fun saveBinding() {
        val title = etAccountTitle.text.toString().trim()
        val number = etAccountNumber.text.toString().trim()
        val bank = etBankName.text.toString().trim()
        val method = methods[spinnerMethod.selectedItemPosition]

        if (title.isEmpty() || number.isEmpty() || bank.isEmpty()) {
            Toast.makeText(context, "Please fill all fields", Toast.LENGTH_SHORT).show()
            return
        }

        btnSaveBinding.isEnabled = false
        btnSaveBinding.text = "Saving..."

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ServiceLocator.apiClient.accountApi.saveBankBinding(
                    mapOf(
                        "accountTitle" to title,
                        "accountNumber" to number,
                        "bankName" to bank,
                        "method" to method
                    )
                )
                if (response.success == true) {
                    Toast.makeText(context, "Bank details saved and locked!", Toast.LENGTH_LONG).show()
                    loadExistingBinding()
                } else {
                    Toast.makeText(context, response.error ?: "Failed to save", Toast.LENGTH_SHORT).show()
                    btnSaveBinding.isEnabled = true
                    btnSaveBinding.text = "Bind Account"
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                btnSaveBinding.isEnabled = true
                btnSaveBinding.text = "Bind Account"
            }
        }
    }
}
