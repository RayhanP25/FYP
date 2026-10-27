/** Joint names and limb bones of the 18-keypoint skeleton, and projection of 3D points into the stereo cameras. */

export const JOINT_NAMES = ['Nose', 'Neck', 'Left shoulder', 'Right shoulder', 'Left elbow', 'Right elbow', 'Left wrist',
    'Right wrist', 'Left fingertip', 'Right fingertip', 'Left hip', 'Right hip', 'Left knee', 'Right knee', 'Left ankle',
    'Right ankle', 'Left toe', 'Right toe'];

/** Limb bones as [parent, child, name] (parent nearer the torso); names match the analysis' stereo_report.bones. */
export const LIMB_BONES: [number, number, string][] = [
    [2, 4, 'left_upper_arm'], [4, 6, 'left_forearm'], [6, 8, 'left_hand'], [3, 5, 'right_upper_arm'], [5, 7, 'right_forearm'],
    [7, 9, 'right_hand'], [10, 12, 'left_thigh'], [12, 14, 'left_shin'], [14, 16, 'left_foot'], [11, 13, 'right_thigh'],
    [13, 15, 'right_shin'], [15, 17, 'right_foot']];

/** Calibration as GET /api/analysis/{id}/edits returns it (OpenCV stereo calibration + floor levelling). */
export interface StereoCalibration {
    K1: number[][]; D1: number[][]; K2: number[][]; D2: number[][];
    R: number[][]; T: number[][]; R_level?: number[][];
    size1: number[]; size2: number[];
}

const mul = (M: number[][], v: number[]) => M.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
const mulT = (M: number[][], v: number[]) => [0, 1, 2].map((i) => M[0][i] * v[0] + M[1][i] * v[1] + M[2][i] * v[2]);

/** A floor-levelled 3D point (mm, as keypoints_3d) in one camera: [x, y] from 0 to 1 like the 2D keypoints,
 *  or null behind the camera. Same model as cv2.projectPoints (k1 k2 p1 p2 k3 distortion). */
export const projectToCamera = (X: number[], cal: StereoCalibration, view: 'left' | 'right'): [number, number] | null => {
    let p = cal.R_level ? mulT(cal.R_level, X) : X;                 // levelled -> left camera frame
    if (view === 'right') {
        p = mul(cal.R, p);
        p = [p[0] + cal.T[0][0], p[1] + cal.T[1][0], p[2] + cal.T[2][0]];
    }
    if (p[2] <= 0) return null;
    const K = view === 'left' ? cal.K1 : cal.K2;
    const D = (view === 'left' ? cal.D1 : cal.D2).flat();
    const size = view === 'left' ? cal.size1 : cal.size2;
    const [k1 = 0, k2 = 0, p1 = 0, p2 = 0, k3 = 0] = D;
    const x = p[0] / p[2], y = p[1] / p[2];
    const r2 = x * x + y * y;
    const radial = 1 + k1 * r2 + k2 * r2 * r2 + k3 * r2 * r2 * r2;
    const xd = x * radial + 2 * p1 * x * y + p2 * (r2 + 2 * x * x);
    const yd = y * radial + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y;
    return [(K[0][0] * xd + K[0][1] * yd + K[0][2]) / size[0], (K[1][1] * yd + K[1][2]) / size[1]];
};

type Vec3 = [number, number, number];
const sub = (a: number[], b: number[]): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The ray through a point of one camera ([x, y] from 0 to 1), in floor-levelled mm: centre and unit direction.
 *  Undistorts like cv2.undistortPoints (k1 k2 p1 p2 k3), as stereo_bones.Rig.ray. */
export const cameraRay = (uv: number[], cal: StereoCalibration, view: 'left' | 'right'): { C: Vec3; d: Vec3 } => {
    const K = view === 'left' ? cal.K1 : cal.K2;
    const size = view === 'left' ? cal.size1 : cal.size2;
    const [k1 = 0, k2 = 0, p1 = 0, p2 = 0, k3 = 0] = (view === 'left' ? cal.D1 : cal.D2).flat();
    const y0 = (uv[1] * size[1] - K[1][2]) / K[1][1];
    const x0 = (uv[0] * size[0] - K[0][2] - K[0][1] * y0) / K[0][0];
    let x = x0, y = y0;
    for (let i = 0; i < 20; i++) {
        const r2 = x * x + y * y;
        const icdist = 1 / (1 + k1 * r2 + k2 * r2 * r2 + k3 * r2 * r2 * r2);
        const dx = 2 * p1 * x * y + p2 * (r2 + 2 * x * x);
        const dy = p1 * (r2 + 2 * y * y) + 2 * p2 * x * y;
        x = (x0 - dx) * icdist;
        y = (y0 - dy) * icdist;
    }
    let d: number[] = [x, y, 1];
    let C: number[] = [0, 0, 0];
    if (view === 'right') {
        d = mulT(cal.R, d);
        C = mulT(cal.R, [-cal.T[0][0], -cal.T[1][0], -cal.T[2][0]]);
    }
    if (cal.R_level) { d = mul(cal.R_level, d); C = mul(cal.R_level, C); }
    const n = Math.hypot(d[0], d[1], d[2]);
    return { C: C as Vec3, d: [d[0] / n, d[1] / n, d[2] / n] };
};

/** Where a joint moved in one camera puts it in 3D (as backend keypoint_edits._target_3d): triangulated with the
 *  other camera's point for it, or, without one, the point on the new ray nearest its current 3D position. */
export const pointFrom2D = (uv: number[], view: 'left' | 'right', otherUv: number[] | null, current: number[] | null,
    cal: StereoCalibration): Vec3 | null => {
    const { C, d } = cameraRay(uv, cal, view);
    if (otherUv) {
        const r2 = cameraRay(otherUv, cal, view === 'left' ? 'right' : 'left');
        const w0 = sub(C, r2.C);
        const a = dot(d, d), b = dot(d, r2.d), c = dot(r2.d, r2.d), dd = dot(d, w0), e = dot(r2.d, w0);
        const den = a * c - b * b;
        if (Math.abs(den) > 1e-9) {
            const s = (b * e - c * dd) / den;
            if (s > 0) return [C[0] + s * d[0], C[1] + s * d[1], C[2] + s * d[2]];
        }
    }
    if (!current) return null;
    const s = Math.max(0, dot(sub(current, C), d));
    return [C[0] + s * d[0], C[1] + s * d[1], C[2] + s * d[2]];
};
