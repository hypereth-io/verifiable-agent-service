import React from 'react'

const Card = ({ 
  children, 
  title, 
  subtitle, 
  className = '', 
  headerAction,
  loading = false,
  isEmpty = false 
}) => {
  return (
    <div className={`glass-card ${className}`}>
      {title && (
        <div className="flex items-center justify-between p-4 border-b border-border-primary">
          <div>
            <h3 className="text-lg font-normal text-text-primary">{title}</h3>
            {subtitle && (
              <p className="text-sm font-light text-text-secondary mt-1">{subtitle}</p>
            )}
          </div>
          {headerAction && (
            <div>{headerAction}</div>
          )}
        </div>
      )}
      
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 spinner"></div>
          </div>
        ) : isEmpty ? (
          <div className="h-32 border-2 border-dashed border-border-dashed rounded-xl flex items-center justify-center">
            <p className="text-text-secondary text-sm">No data available</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

export default Card