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
    pos: [-2.85, 1.22, 3.25],
    target: [0.05, 0.62, 0.15],
  },
  {
    id: "rear34",
    label: "Tył 3/4",
    pos: [-2.75, 1.18, -3.4],
    target: [0.0, 0.66, -0.2],
  },
  {
    id: "side",
    label: "Bok",
    pos: [-5.15, 1.12, 0.35],
    target: [0, 0.68, 0],
  },
];

export function poseByName(name: string | null): Pose {
  return POSES.find((p) => p.id === name) ?? POSES[0];
}
