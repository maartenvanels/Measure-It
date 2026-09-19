import * as THREE from 'three';
import type { SceneObject, ObjectTransform } from '@/types/scene-object';
import type { AnyMeasurement, Point, Point3D } from '@/types/measurement';
import { calcPolygonArea, calcAngleDeg, pixelDist } from './geometry';

export function sourceMatrix(transform: ObjectTransform) {
  return new THREE.Matrix4().compose(new THREE.Vector3(...transform.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...transform.rotation)), new THREE.Vector3(...transform.scale));
}
export function hitSourceId(hit: THREE.Object3D): string | undefined {
  let node: THREE.Object3D | null = hit;
  while (node) { if (typeof node.userData.objectId === 'string') return node.userData.objectId; node = node.parent; }
}
export function localPoint(point: Point3D, source?: Pick<SceneObject, 'transform'>): THREE.Vector3 {
  const p = new THREE.Vector3(point.x, point.y, point.z);
  return source ? p.applyMatrix4(sourceMatrix(source.transform).invert()) : p;
}
export function migrateWorldMeasurement(m: AnyMeasurement, source?: Pick<SceneObject, 'transform'>): AnyMeasurement {
  if (!source) return m;
  const p2 = (p: Point): Point => { const v = localPoint({ x: p.x, y: -p.y, z: 0 }, source); return { x: v.x, y: -v.y }; };
  if (m.type === 'annotation') return { ...m, position: p2(m.position), ...(m.arrowTarget ? { arrowTarget: p2(m.arrowTarget) } : {}) };
  if (m.type === 'angle') {
    const vertex = p2(m.vertex), armA = p2(m.armA), armB = p2(m.armB);
    return { ...m, vertex, armA, armB, angleDeg: calcAngleDeg(vertex, armA, armB) };
  }
  if (m.type === 'area') {
    const points = m.points.map(p2);
    const radius = m.radius == null ? undefined : m.radius / Math.abs(source.transform.scale[0]);
    return { ...m, points, pixelArea: radius == null ? calcPolygonArea(points) : Math.PI * radius * radius,
      ...(m.center ? { center: p2(m.center) } : {}), ...(radius != null ? { radius } : {}) };
  }
  if (m.combinedFrom) return m;
  if (m.surface === 'model' && m.start3D && m.end3D) {
    const start = localPoint(m.start3D, source), end = localPoint(m.end3D, source);
    const distance = start.distanceTo(end);
    return { ...m, start3D: { x: start.x, y: start.y, z: start.z }, end3D: { x: end.x, y: end.y, z: end.z }, pixelLength: distance, distance };
  }
  const start = p2(m.start), end = p2(m.end);
  return { ...m, start, end, pixelLength: pixelDist(start, end) };
}
