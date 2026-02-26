import SidebarItem from "./sidebarItem";
import SectionTitle from "./sectionTitle";
import { Home, Video, Camera, Activity, Box, Database, Settings, BarChart3 } from 'lucide-react';

// All titles and sidebar items are temporarily filled ranodm stuff for now

const Sidebar = () => {
    return (
        <aside className="w-64 bg-white border-r border-gray-200 overflow-y-auto h-full no-scrollbar">
            <ul className="flex flex-col gap-2 ml-4">
                <SidebarItem icon={Home} text="Dashboard" href="/home" />

                <SectionTitle title="Video Management" />
                <SidebarItem icon={Video} text="Videos" href="/videos" />
                <SidebarItem icon={Camera} text="Camera Capture" href="/camera-capture" />

                <SectionTitle title="Pose Estimation" />
                <SidebarItem icon={Activity} text="Prediction Results" href="/prediction-results" />
                <SidebarItem icon={Box} text="3D Reconstruction" href="/3d-reconstruction" />

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