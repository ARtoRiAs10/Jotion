"use client"

import { ClerkProvider, useAuth } from "@clerk/clerk-react"
import { ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { ReactNode, useEffect } from "react"
import { restoreDevSession } from "@/lib/dev-auth"

// Falls back to a placeholder so that the app can be built without a
// Convex deployment. Set NEXT_PUBLIC_CONVEX_URL in your environment.
const convex = new ConvexReactClient(
    process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://jotion.convex.cloud",
)

export const ConvexClientProvider = ({
    children

} : {
    children: ReactNode;
}) => {
    // A development session (see /dev/signin) is restored automatically.
    useEffect(() => {
        restoreDevSession(convex)
    }, [])

    return (
        <ClerkProvider
        publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}
        >
            <ConvexProviderWithClerk
            useAuth = {useAuth}
            client= {convex}
            >

            {children}
            </ConvexProviderWithClerk>

        </ClerkProvider>
    )
}
