import * as THREE from 'three';

/** Zoom around a point on the view plane while keeping that point under the cursor. */
export function zoomCameraAt(
  camera: THREE.Camera, target: THREE.Vector3, ndc: THREE.Vector2, factor: number,
): void {
  if (!Number.isFinite(factor) || factor <= 0) return;
  camera.updateMatrixWorld();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), target);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  const before = ray.ray.intersectPlane(plane, new THREE.Vector3());
  if (camera instanceof THREE.OrthographicCamera) {
    camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, 0.05, 50);
    camera.updateProjectionMatrix();
  } else if (camera instanceof THREE.PerspectiveCamera) {
    const offset = camera.position.clone().sub(target);
    const distance = THREE.MathUtils.clamp(offset.length() / factor, camera.near * 2, camera.far / 2);
    camera.position.copy(target).add(offset.setLength(distance));
  }
  camera.updateMatrixWorld();
  ray.setFromCamera(ndc, camera);
  const after = ray.ray.intersectPlane(plane, new THREE.Vector3());
  if (before && after) {
    const delta = before.sub(after);
    camera.position.add(delta);
    target.add(delta);
  }
  camera.updateMatrixWorld();
}
