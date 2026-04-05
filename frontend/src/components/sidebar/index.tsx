import SidebarItem from "./sidebarItem";
import SectionTitle from "./sectionTitle";
import { Home, Video, Camera, Database, Settings, BarChart3, User2, Users } from 'lucide-react';

// All titles and sidebar items are temporarily filled ranodm stuff for now

const Sidebar = () => {
    return (
        <aside className="w-64 bg-background border-r border-gray-200 overflow-y-auto h-full no-scrollbar">
            <ul className="flex flex-col gap-2 ml-4">
                <SidebarItem icon={Home} text="Dashboard" href="/home" />

                <SectionTitle title="Users" />
                <SidebarItem icon={User2} text="User Profile" href="/user-profile" />
                <SidebarItem icon={Users} text="View users" href="/view-users" />

                <SectionTitle title="Video Management" />
                <SidebarItem icon={Video} text="Video test" href="/video-test" />
                <SidebarItem icon={Camera} text="Camera Capture" href="/camera-capture" />

                <SectionTitle title="Analysis" />
                <SidebarItem icon={BarChart3} text="Kinematic Analysis" href="/kinematic-analysis" />

                <SectionTitle title="System" />
                <SidebarItem icon={Database} text="Database" href="/database" badge="5679" />
                <SidebarItem icon={Settings} text="Settings" href="/settings" />
            </ul>
        </aside>
    )
}

export default Sidebar