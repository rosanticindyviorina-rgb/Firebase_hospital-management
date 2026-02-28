package com.kamyabi.cash.tasks.ui

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.kamyabi.cash.R

data class BannerItem(
    val emoji: String,
    val title: String,
    val subtitle: String,
    val backgroundResId: Int
)

class BannerAdapter(private val banners: List<BannerItem>) :
    RecyclerView.Adapter<BannerAdapter.BannerViewHolder>() {

    inner class BannerViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val background: View = view.findViewById(R.id.bannerBackground)
        val emoji: TextView = view.findViewById(R.id.tvBannerEmoji)
        val title: TextView = view.findViewById(R.id.tvBannerTitle)
        val subtitle: TextView = view.findViewById(R.id.tvBannerSubtitle)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): BannerViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_banner, parent, false)
        return BannerViewHolder(view)
    }

    override fun onBindViewHolder(holder: BannerViewHolder, position: Int) {
        val banner = banners[position % banners.size]
        holder.background.setBackgroundResource(banner.backgroundResId)
        holder.emoji.text = banner.emoji
        holder.title.text = banner.title
        holder.subtitle.text = banner.subtitle
    }

    override fun getItemCount(): Int = Int.MAX_VALUE // Infinite scroll loop
}
