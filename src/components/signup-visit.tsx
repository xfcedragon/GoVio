"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"

const SignupVisitContext = createContext(1)

/**
 * Lives in the root layout, outside the page cache that keeps /signup mounted
 * after a client navigation. Each return to /signup gets a new id so the
 * signup form remounts instead of replaying the previous confirmation.
 */
export function SignupVisitProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [visit, setVisit] = useState({ path: pathname, id: 1 })
  if (pathname !== visit.path) {
    setVisit({
      path: pathname,
      id: pathname === "/signup" && visit.path !== "/signup" ? visit.id + 1 : visit.id,
    })
  }
  return <SignupVisitContext.Provider value={visit.id}>{children}</SignupVisitContext.Provider>
}

export function useSignupVisitId(): number {
  return useContext(SignupVisitContext)
}
