package com.kamyabi.cash.core.ui

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.animation.OvershootInterpolator
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.kamyabi.cash.R

/**
 * Splash screen with smooth fade-in + scale animation.
 * Shows app logo, name, and tagline before transitioning to MainActivity.
 */
class SplashActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_splash)

        val tvLogo = findViewById<TextView>(R.id.tvSplashLogo)
        val tvAppName = findViewById<TextView>(R.id.tvSplashAppName)
        val tvTagline = findViewById<TextView>(R.id.tvSplashTagline)
        val progressBar = findViewById<ProgressBar>(R.id.splashProgress)

        // Logo animation: fade in + scale up with overshoot
        val logoFade = ObjectAnimator.ofFloat(tvLogo, View.ALPHA, 0f, 1f).setDuration(800)
        val logoScaleX = ObjectAnimator.ofFloat(tvLogo, View.SCALE_X, 0.5f, 1f).setDuration(800)
        val logoScaleY = ObjectAnimator.ofFloat(tvLogo, View.SCALE_Y, 0.5f, 1f).setDuration(800)
        logoScaleX.interpolator = OvershootInterpolator(2f)
        logoScaleY.interpolator = OvershootInterpolator(2f)

        // App name: fade in + slide up
        val nameFade = ObjectAnimator.ofFloat(tvAppName, View.ALPHA, 0f, 1f).setDuration(600)
        val nameSlide = ObjectAnimator.ofFloat(tvAppName, View.TRANSLATION_Y, 30f, 0f).setDuration(600)

        // Tagline: fade in
        val taglineFade = ObjectAnimator.ofFloat(tvTagline, View.ALPHA, 0f, 1f).setDuration(500)

        // Progress bar: fade in
        val progressFade = ObjectAnimator.ofFloat(progressBar, View.ALPHA, 0f, 1f).setDuration(400)

        val animatorSet = AnimatorSet()
        animatorSet.playSequentially(
            AnimatorSet().apply { playTogether(logoFade, logoScaleX, logoScaleY) },
            AnimatorSet().apply { playTogether(nameFade, nameSlide) },
            taglineFade,
            progressFade
        )
        animatorSet.startDelay = 300
        animatorSet.start()

        // Navigate to MainActivity after animation
        tvLogo.postDelayed({
            startActivity(Intent(this, MainActivity::class.java))
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
            finish()
        }, 2800)
    }
}
