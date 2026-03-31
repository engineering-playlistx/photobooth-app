import React from 'react'
import { Link, useRouterState } from '@tanstack/react-router'

export default function Header() {
  const { location } = useRouterState()

  if (location.pathname.startsWith('/result/')) return null

  return (
    <>
      <header className="p-4 flex items-center bg-gray-800 text-white shadow-lg">
        <h1 className="ml-4 text-xl font-semibold">
          <Link to="/">PlaylistX Photobooth</Link>
        </h1>
      </header>
    </>
  )
}
