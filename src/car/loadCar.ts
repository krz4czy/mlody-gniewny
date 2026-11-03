import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = `${import.meta.env.BASE_URL}models/bmw-m3-coupe-e46.glb`;

/**
 * Sketchfab GLB of the Mona x Supercars E46 M3 coupe.
 * SketchUp export: Z-up, inches. Wheels are not separate nodes — rims, tires
 * and discs are merged into material meshes (llanta, M305_rin, disk).
 */
export async function loadCar(): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  const model = gltf.scene;

  const car = new THREE.Group();
  car.name = "e46";
  car.userData = { type: "car", model: "e46-m3-coupe", wheelsSeparate: false };
  // Sketchfab root already converts the SketchUp Z-up inches into Y-up.
  // Nose (grille) sits on -Z; yaw so it faces the front camera.
  car.rotation.y = Math.PI;
  car.scale.setScalar(0.0254);
  car.add(model);

  car.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return car;
}
