import React from 'react'
import { useAppStore } from '../../stores/appStore'

// Import Figma SVG assets
import HyperETHLogo from '../../assets/icons/hypereth-logo.svg'
import WalletIcon from '../../assets/icons/wallet.svg'
import EthereumIcon from '../../assets/icons/ethereum.svg'
import ChevronDownIcon from '../../assets/icons/chevron-down.svg'
import BookmarkIcon from '../../assets/icons/bookmark.svg'
import SettingsIcon from '../../assets/icons/settings.svg'

const Header = () => {
  const { isDemoMode, setDemoMode } = useAppStore()

  return (
    <div className="bg-card border-b border-border-primary h-16 flex items-center justify-between px-8 relative" data-name="Header">
      {/* Border effect */}
      <div className="absolute border-b-[0.75px] border-border-primary inset-0 pointer-events-none" />
      
      {/* Left side - Logo and Navigation */}
      <div className="flex items-center gap-8" data-node-id="509:6833">
        {/* Logo */}
        <a 
          href="https://hypereth.io" 
          target="_blank" 
          rel="noopener noreferrer"
          className="h-6 w-[122.853px]" 
          data-node-id="678:10604"
        >
          <img 
            src={HyperETHLogo} 
            alt="HyperETH" 
            className="block max-w-none size-full hover:opacity-80 transition-opacity" 
          />
        </a>
        
        {/* Navigation */}
        <nav className="flex items-center gap-9 text-base leading-[0]" data-node-id="509:6835">
          <a 
            href="https://hypereth.io/perps" 
            target="_blank" 
            rel="noopener noreferrer"
            className="font-work font-light text-text-secondary hover:text-text-primary transition-colors"
          >
            Perps
          </a>
          <a 
            href="https://hypereth.io/spot" 
            target="_blank" 
            rel="noopener noreferrer"
            className="font-work font-light text-text-secondary hover:text-text-primary transition-colors"
          >
            Spot  
          </a>
          <a 
            href="https://hypereth.io/rewards" 
            target="_blank" 
            rel="noopener noreferrer"
            className="font-work font-light text-text-secondary hover:text-text-primary transition-colors"
          >
            Rewards
          </a>
          <span className="font-work font-normal text-white">
            Agent
          </span>
        </nav>
      </div>

      {/* Center - Demo Controls */}
      <div className="flex items-center gap-3">
        {/* Demo Mode Toggle */}
        <button
          onClick={() => setDemoMode(!isDemoMode)}
          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
            isDemoMode 
              ? 'bg-white text-background' 
              : 'bg-border-primary text-text-secondary border border-border-secondary hover:bg-border-secondary hover:text-text-primary'
          }`}
        >
          {isDemoMode ? 'Demo Mode' : 'Live Mode'}
        </button>

        {/* Reset Demo Button */}
        <button
          onClick={() => {
            if (window.confirm('Reset the demo? This will clear all data.')) {
              // We need to access the store reset function
              // For now, we'll just reload the page
              window.location.reload()
            }
          }}
          className="px-3 py-1.5 rounded-xl text-sm font-medium bg-border-primary text-text-secondary border border-border-secondary hover:bg-border-secondary transition-colors"
        >
          Reset Demo
        </button>
      </div>

      {/* Right side - Wallet info and controls */}
      <div className="flex items-center gap-3" data-node-id="520:6489">
        <div className="flex items-center gap-4" data-node-id="520:6490">
          <div className="flex items-center gap-3" data-node-id="520:6491">
            {/* Balance Display */}
            <div className="bg-border-primary border border-border-secondary rounded-xl px-3 py-1 flex items-center gap-2 h-9" data-node-id="520:6492">
              <div className="w-4 h-4 overflow-clip" data-name="hugeicons:wallet-02" data-node-id="520:6493">
                <img 
                  src={WalletIcon} 
                  alt="Wallet" 
                  className="block max-w-none size-full" 
                />
              </div>
              <div className="flex items-center gap-2" data-node-id="520:6498">
                <div className="font-work font-normal text-[rgba(255,255,255,0.75)] leading-[0]" data-node-id="520:6499">
                  <span className="text-sm">250.00 </span>
                  <span className="text-xs">USD</span>
                </div>
                <div className="flex items-center justify-center" data-node-id="520:6500">
                  <div className="w-3 h-3 flex items-center justify-center" data-node-id="520:6501">
                    <img 
                      src={ChevronDownIcon} 
                      alt="Chevron Down" 
                      className="block max-w-none size-full rotate-180" 
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Address Display */}
            <div className="bg-border-primary border border-border-secondary rounded-xl px-3 py-1 flex items-center gap-2 h-9" data-node-id="520:6502">
              <div className="relative w-5 h-5 flex items-center justify-center" data-node-id="520:6503">
                <div className="absolute inset-0 bg-accent rounded-full" data-node-id="520:6504" />
                <div className="relative w-[8.93px] h-[14.286px] flex items-center justify-center" data-node-id="520:6505">
                  <img 
                    src={EthereumIcon} 
                    alt="Ethereum" 
                    className="block max-w-none size-full" 
                  />
                </div>
              </div>
              <div className="flex items-center gap-2" data-node-id="520:6512">
                <div className="font-work font-normal text-sm text-[rgba(255,255,255,0.75)] leading-[0]" data-node-id="520:6513">
                  0x6995...Ab8a
                </div>
                <div className="flex items-center justify-center" data-node-id="520:6514">
                  <div className="w-3 h-3 flex items-center justify-center" data-node-id="520:6515">
                    <img 
                      src={ChevronDownIcon} 
                      alt="Chevron Down" 
                      className="block max-w-none size-full rotate-180" 
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

export default Header