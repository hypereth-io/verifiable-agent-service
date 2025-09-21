import React from 'react'
import Header from './Header'

const Layout = ({ children }) => {
  return (
    <div className="min-h-screen bg-background relative">
      {/* Background gradient/blur effect */}
      <div className="fixed inset-0 pointer-events-none">
        <div 
          className="absolute inset-0 opacity-[0.78] blur-[50px] bg-gradient-to-br from-purple-900/20 via-blue-900/20 to-transparent"
          style={{
            backgroundSize: '120.56% 120.56%',
            backgroundPosition: '0.01% 99.98%',
            backgroundRepeat: 'no-repeat',
          }}
        />
      </div>
      
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