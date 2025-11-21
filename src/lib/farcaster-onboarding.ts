/**
 * Farcaster Sign-In utilities for onboarding
 * Handles Farcaster protocol authentication flow and profile data fetching
 * Uses official Farcaster protocol endpoints (farcaster.xyz)
 */

import { logger } from './logger'

export interface FarcasterOnboardingProfile {
  fid: number
  username: string
  displayName?: string
  pfpUrl?: string
  bio?: string
}

interface FarcasterAuthResponse {
  message: string
  signature: string
  fid: number
  username: string
  displayName?: string
  pfpUrl?: string
  bio?: string
}

/**
 * Open Farcaster Sign-In popup and handle authentication
 * Uses official Farcaster protocol endpoints via connect.farcaster.xyz
 */
export async function openFarcasterOnboardingPopup(
  userId: string
): Promise<FarcasterOnboardingProfile> {
  return new Promise((resolve, reject) => {
    // Generate state for verification
    const state = `onboarding:${userId}:${Date.now()}:${Math.random().toString(36).substring(7)}`
    
    // Build Farcaster protocol auth URL using official protocol endpoint
    // Uses farcaster.xyz (protocol domain) instead of warpcast.com (client domain)
    // The channelToken parameter is used for the Sign In with Farcaster flow
    // URL encode the channelToken to ensure special characters are properly handled
    const authUrl = `https://farcaster.xyz/~/sign-in-with-farcaster?channelToken=${encodeURIComponent(state)}`
    
    // Open popup
    const width = 500
    const height = 700
    const left = window.screen.width / 2 - width / 2
    const top = window.screen.height / 2 - height / 2
    
    const popup = window.open(
      authUrl,
      'Farcaster Sign In',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
    )

    if (!popup) {
      reject(new Error('Failed to open popup. Please allow popups for this site.'))
      return
    }

    // Listen for message from popup
    const handleMessage = async (event: MessageEvent) => {
      // Security: verify origin - allow messages from farcaster.xyz (protocol domain)
      // The popup at farcaster.xyz/~/sign-in-with-farcaster posts messages back to parent
      const allowedOrigins = [
        'https://farcaster.xyz',
        'https://www.farcaster.xyz',
        window.location.origin, // Also allow same-origin for development/testing
      ]
      if (!allowedOrigins.includes(event.origin)) {
        logger.warn('Rejected message from unauthorized origin', { origin: event.origin }, 'FarcasterOnboarding')
        return
      }

      const data = event.data as FarcasterAuthResponse & { type?: string }

      if (data.type !== 'FARCASTER_AUTH_SUCCESS') {
        return
      }

      logger.info('Received Farcaster auth message', { fid: data.fid }, 'FarcasterOnboarding')

      popup?.close()
      window.removeEventListener('message', handleMessage)

      const response = await fetch('/api/auth/onboarding/farcaster/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: data.message,
          signature: data.signature,
          fid: data.fid,
          username: data.username,
          displayName: data.displayName,
          pfpUrl: data.pfpUrl,
          bio: data.bio,
          state,
        }),
      })

      if (!response.ok) {
        let error
        try {
          error = await response.json()
        } catch {
          throw new Error('Failed to verify Farcaster authentication')
        }
        throw new Error((error as { error?: string }).error || 'Failed to verify Farcaster authentication')
      }

      try {
      await response.json()
      } catch {
        // Response is ok but empty or invalid JSON - this is acceptable
      }
      
      resolve({
        fid: data.fid,
        username: data.username,
        displayName: data.displayName,
        pfpUrl: data.pfpUrl,
        bio: data.bio,
      })
    }

    // Listen for popup close without authentication
    const checkPopupClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkPopupClosed)
        window.removeEventListener('message', handleMessage)
        reject(new Error('Authentication cancelled'))
      }
    }, 500)

    // Add message listener
    window.addEventListener('message', handleMessage)

    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(checkPopupClosed)
      window.removeEventListener('message', handleMessage)
      if (popup && !popup.closed) {
        popup.close()
      }
      reject(new Error('Authentication timeout'))
    }, 5 * 60 * 1000)
  })
}

/**
 * Alternative: Use Neynar's Farcaster auth widget (simpler integration)
 */
export async function openNeynarFarcasterAuth(
  userId: string
): Promise<FarcasterOnboardingProfile> {
  // This would use Neynar's auth widget if available
  // For now, we'll use the Farcaster protocol flow above
  return openFarcasterOnboardingPopup(userId)
}

/**
 * Fetch additional Farcaster profile data from Neynar API
 */
export async function fetchFarcasterProfile(fid: number): Promise<FarcasterOnboardingProfile | null> {
  const response = await fetch(`/api/farcaster/profile/${fid}`)
  
  if (!response.ok) {
    return null
  }

  const data = await response.json()
  return data.profile
}

