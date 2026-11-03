export type PoseName = "front34" | "rear34" | "side";

export type Pose = {
  id: PoseName;
  label: string;
  pos: [number, number, number];
  target: [number, number, number];
};

export const POSES: Pose[] = [
  {
    id: "front34",
    label: "Przód 3/4",
    pos: [-4.4, 1.7, 5.6],
    target: [0, 0.7, 0],
  },
  {
    id: "rear34",
    label: "Tył 3/4",
    pos: [-4.3, 1.65, -5.5],
    target: [0, 0.7, 0],
  },
  {
    id: "side",
    label: "Bok",
    pos: [-8.4, 1.55, 0.15],
    target: [0, 0.7, 0],
  },
];

export function poseByName(name: string | null): Pose {
  return POSES.find((p) => p.id === name) ?? POSES[0];
}
