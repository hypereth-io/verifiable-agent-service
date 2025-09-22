import React from 'react'
import Header from './Header'
import BackgroundImage from '../../assets/background.png'

const Layout = ({ children }) => {
  return (
    <div className="min-h-screen relative">
      {/* Figma background image with exact styling */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute flex h-screen items-center justify-center left-0 top-0 w-full">
          <div className="flex-none rotate-180 scale-y-[-100%]">
            <div 
              className="blur-[50px] filter h-screen opacity-[0.78] w-full"
              style={{
                backgroundImage: `url('${BackgroundImage}')`,
                backgroundPosition: '0.01% 99.98%',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '120.56% 120.56%',
              }}
            />
          </div>
        </div>
      </div>

      {/* Dark overlay for readability */}
      <div className="fixed inset-0 bg-background/60 pointer-events-none z-5"></div>
      
      {/* Main content */}
      <div className="relative z-10">
        <Header />
        <main className="px-8 py-4">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout