"use client";

import { useSession, signOut } from "next-auth/react";
import { useState, useRef, useEffect, useCallback } from "react";
import { trackAuthEvent } from "./auth-tracking";

export function UserMenu() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, handleClickOutside]);

  async function handleSignOut() {
    trackAuthEvent("logout");
    try {
      await signOut({ callbackUrl: "/" });
    } catch {
      // signOut 失败时仍清除本地状态，确保用户感知到"已退出"
      window.location.href = "/";
    }
  }

  if (!session) return null;

  const avatarUrl = session.user.avatarUrl ?? session.user.image;
  const userName = session.user.name ?? "";
  const userEmail = session.user.email ?? "";
  const initials = userName.charAt(0).toUpperCase() || userEmail.charAt(0).toUpperCase() || "U";

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="用户菜单"
        aria-expanded={isOpen}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={userName}
            className="h-full w-full object-cover"
            onError={(e) => {
              // Google 头像加载失败时显示名称首字母
              e.currentTarget.style.display = "none";
              const parent = e.currentTarget.parentElement;
              if (parent) {
                parent.textContent = initials;
                parent.classList.add("text-sm", "font-medium", "text-gray-600");
              }
            }}
          />
        ) : (
          <span className="text-sm font-medium text-gray-600">{initials}</span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
          <div className="px-4 py-2">
            <p className="text-sm font-medium text-gray-900">{userName}</p>
            <p className="text-xs text-gray-500">{userEmail}</p>
          </div>
          <hr className="my-1 border-gray-200" />
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
