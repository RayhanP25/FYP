import AppLayout from "@/layout/AppLayout"
// should have blank canva with keypoints on top of video 

const VideoTest = () => {
    return (
        <AppLayout>
            <div className="p-8">
                <div className="flex justify-center">
                    <div className="w-full max-w-4xl">
                        <div className="relative overflow-hidden rounded-lg shadow-lg bg-black">
                            <iframe
                                //Scarmble: https://scramble.cloud/#vd!VEfyCVpm18zUgI5br6axZ92JKuac6RG_ufBMJGVZufg!b8SpVJcbdlNk74SoLs2T3lhISU8EhB8OpxW6FrBRaKc
                                //file garden: https://file.garden/acS_xF-DvzxbnxWk/FYP%20Videos/file_example_MP4_1920_18MG.mp4
                                //mega: https://mega.nz/file/xVFQhTbC#TtfcbRtIiUhgtB9hRjRCPbybunBoAyVpxP8C0xNXSGE
                                //cloudinary: https://res.cloudinary.com/dso3fnn4j/video/upload/v1774508115/file_example_MP4_1920_18MG_dh5sd2.mp4
                                src="https://res.cloudinary.com/dso3fnn4j/video/upload/v1774508115/file_example_MP4_1920_18MG_dh5sd2.mp4"
                                className="w-full aspect-video"
                                allowFullScreen
                            />
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}

export default VideoTest