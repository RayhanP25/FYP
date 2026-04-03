import { Search } from 'lucide-react';

const HeaderSearchbar = () => {
    return (
        <div className="relative bg-background-main rounded-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
            <input
                className="w-80 pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" placeholder="Search Prediction results..." type="text" />
        </div>
    )
}

export default HeaderSearchbar