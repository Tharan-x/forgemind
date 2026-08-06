import React, { useState } from 'react';

interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function UserAvatar({
  name,
  email,
  avatarUrl,
  size = 'md',
  className = '',
}: UserAvatarProps) {
  const [imageError, setImageError] = useState(false);

  const displayName = name || email?.split('@')[0] || 'User';
  const initial = displayName.charAt(0).toUpperCase();

  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-9 h-9 text-sm',
    lg: 'w-14 h-14 text-xl',
  };

  if (avatarUrl && !imageError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={displayName}
        onError={() => setImageError(true)}
        className={`${sizeClasses[size]} rounded-full object-cover border border-zinc-700 shadow-sm ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full bg-gradient-to-tr from-emerald-600 to-zinc-700 text-white font-bold flex items-center justify-center border border-zinc-700 shadow-sm ${className}`}
      title={displayName}
    >
      {initial}
    </div>
  );
}
