import { Navbar } from "./_components/navbar";

const MarketingLayout = ({
    children
}: {
    children: React.ReactNode;
}) => {
    return (

        <div className="h-full dark:bg-[#1F1F1F] ">
            
        <Navbar />
        <main className="min-h-full">
        {children}
        </main>
        </div>
    )
}

export default MarketingLayout;