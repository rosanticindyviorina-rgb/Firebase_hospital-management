package com.kamyabi.cash.gaming.ui

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
import com.kamyabi.cash.R
import com.kamyabi.cash.core.di.ServiceLocator
import kotlinx.coroutines.launch

class GamingFragment : Fragment() {

    private data class PlatformViews(
        val card: View,
        val status: TextView,
        val cooldown: TextView,
        val playBtn: Button
    )

    private val platforms = mutableMapOf<String, PlatformViews>()
    private val cooldownTimers = mutableListOf<CountDownTimer>()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        return inflater.inflate(R.layout.fragment_gaming, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        bindViews(view)
        loadGamingStatus()
    }

    private fun bindViews(view: View) {
        val platformIds = mapOf(
            "adjoe" to PlatformIds(R.id.cardAdjoe, R.id.tvAdjoeStatus, R.id.tvAdjoeCooldown, R.id.btnAdjoePlay),
            "tapjoy" to PlatformIds(R.id.cardTapjoy, R.id.tvTapjoyStatus, R.id.tvTapjoyCooldown, R.id.btnTapjoyPlay),
            "offertoro" to PlatformIds(R.id.cardOffertoro, R.id.tvOffertoroStatus, R.id.tvOffertoroCooldown, R.id.btnOffertoroPlay),
            "gamezop" to PlatformIds(R.id.cardGamezop, R.id.tvGamezopStatus, R.id.tvGamezopCooldown, R.id.btnGamezopPlay),
            "reserved" to PlatformIds(R.id.cardReserved, R.id.tvReservedStatus, R.id.tvReservedCooldown, R.id.btnReservedPlay),
        )

        for ((key, ids) in platformIds) {
            platforms[key] = PlatformViews(
                card = view.findViewById(ids.card),
                status = view.findViewById(ids.status),
                cooldown = view.findViewById(ids.cooldown),
                playBtn = view.findViewById(ids.play)
            )
            platforms[key]!!.playBtn.setOnClickListener { startSession(key) }
        }
    }

    private data class PlatformIds(val card: Int, val status: Int, val cooldown: Int, val play: Int)

    private fun loadGamingStatus() {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ServiceLocator.apiClient.gamingApi.getGamingStatus()
                cancelTimers()
                val now = System.currentTimeMillis()

                // Calculate total coins earned today from all platforms
                val totalToday = response.platforms.values.sumOf { it.coinsEarnedToday }
                view?.findViewById<TextView>(R.id.tvGamingTotalCoins)?.text =
                    "Today: $totalToday KC Coins earned"

                for ((key, views) in platforms) {
                    val pStatus = response.platforms[key]
                    if (pStatus == null) {
                        views.status.text = "Coming Soon"
                        views.playBtn.isEnabled = false
                        views.playBtn.alpha = 0.5f
                        continue
                    }

                    views.status.text = "Session ${pStatus.sessionsToday}/${pStatus.maxSessions}"
                    views.playBtn.isEnabled = pStatus.canPlay
                    views.playBtn.alpha = if (pStatus.canPlay) 1.0f else 0.5f
                    views.playBtn.text = if (pStatus.activeSession) "Resume" else if (pStatus.canPlay) "Play" else "Locked"

                    // Show cooldown timer if needed
                    if (!pStatus.canPlay && pStatus.nextSessionAt > now && !pStatus.activeSession) {
                        startCooldownTimer(views.cooldown, pStatus.nextSessionAt)
                    } else {
                        views.cooldown.visibility = View.GONE
                    }
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Failed to load gaming status", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun startSession(platform: String) {
        val views = platforms[platform] ?: return
        views.playBtn.isEnabled = false

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                val response = ServiceLocator.apiClient.gamingApi.startSession(mapOf("platform" to platform))
                if (response.success) {
                    Toast.makeText(
                        context,
                        "Session ${response.sessionNumber} started! ${response.maxMinutes} min cap.",
                        Toast.LENGTH_LONG
                    ).show()
                    // TODO: Open WebView/SDK for the platform
                    // For now, reload status to reflect active session
                    loadGamingStatus()
                } else {
                    Toast.makeText(context, response.error ?: "Cannot start session", Toast.LENGTH_SHORT).show()
                    views.playBtn.isEnabled = true
                }
            } catch (e: Exception) {
                Toast.makeText(context, e.message ?: "Error", Toast.LENGTH_SHORT).show()
                views.playBtn.isEnabled = true
            }
        }
    }

    private fun startCooldownTimer(tv: TextView, nextAt: Long) {
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
                tv.text = if (h > 0) "Next session: ${h}h ${m}m ${s}s" else "Next session: ${m}m ${s}s"
            }
            override fun onFinish() {
                tv.visibility = View.GONE
                loadGamingStatus()
            }
        }.start()
        cooldownTimers.add(timer)
    }

    private fun cancelTimers() {
        cooldownTimers.forEach { it.cancel() }
        cooldownTimers.clear()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        cancelTimers()
    }
}
