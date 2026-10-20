"use client"

import { ModeToggle } from "@/components/mode-toggle";
import { useScrollTop } from "@/hooks/use-scroll-top";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";

import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { SignInButton, UserButton } from "@clerk/clerk-react";
import { useConvexAuth } from "convex/react";
import Link from "next/link";

export const Navbar = () => {
    const {isAuthenticated, isLoading} = useConvexAuth();

    const scrolled = useScrollTop();

    return (
        <div className= {cn("z-50bg-background dark:bg-[#1F1F1F] fixed top-0 flex items-center w-full p-F6", scrolled && "border-b shadow-sm" )}>
             <Logo/>
             <div className="md:ml-auto md:justify-end justify-between w-full flex items-center gap-x-2">
                {isLoading  && (
                    <Spinner/>
                )}
                {!isAuthenticated && !isLoading && (
                    <>
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/pricing">
                            Pricing
                        </Link>
                    </Button>
                    
                    <SignInButton mode="modal">
                        <Button variant="ghost" size='sm'>
                            Log in
                        </Button>
                    </SignInButton>

                    <SignInButton mode="modal">
                        <Button  size='sm'>
                            Get Jotin Free
                        </Button>
                    </SignInButton>
                    
                    </>
                )}

                {isAuthenticated && !isLoading && (
                    <>
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/pricing">
                            Pricing
                        </Link>

                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/documents">
                            Enter Jotion
                        </Link>

                    </Button>
                    <UserButton 
                    afterSignOutUrl="/"
                    />

                    </>
                )}
                <ModeToggle/>

             </div>
        </div>
    )
}