import RAPIER from '@dimforge/rapier3d-compat';

const ANCHOR = { x: 0, y: 6.1, z: 0 };
const ATTACHMENT_HEIGHT = 2.06;
const REST_YAW = 0.12;
const REST_TILT = -0.07;
// Rotation about Y followed by the badge's local Z gives a readable, loose pose.
const REST_ROTATION = {
  x: Math.sin(REST_YAW / 2) * Math.sin(REST_TILT / 2),
  y: Math.sin(REST_YAW / 2) * Math.cos(REST_TILT / 2),
  z: Math.cos(REST_YAW / 2) * Math.sin(REST_TILT / 2),
  w: Math.cos(REST_YAW / 2) * Math.cos(REST_TILT / 2),
};
const REST_OFFSET = attachmentOffset(REST_ROTATION);
// Center the clip under the fixed anchor, accounting for the tilted badge.
const REST = { x: -REST_OFFSET.x, y: 0.55, z: -REST_OFFSET.z };
const SEGMENTS = 5;
const CARD_MASS = 1.5;
const SEGMENT_MASS = 0.16;
const GRAVITY = 9.81;
const ROPE_LENGTH = ANCHOR.y - REST.y - REST_OFFSET.y;
const LINK_LENGTH = ROPE_LENGTH / SEGMENTS;
const MAX_STRETCH = 0.4;
const SPRING_STIFFNESS = 360;
const SPRING_DAMPING = 52;
const PROGRESSIVE_STIFFNESS = 140;
const FIXED_DT = 1 / 120;
const MAX_SUBSTEPS = 12;
const ZERO = { x: 0, y: 0, z: 0 };
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
let initialization;

const copyVector = ({ x, y, z }) => ({ x, y, z });
const finiteVector = (v) => v != null && [v.x, v.y, v.z].every(Number.isFinite);
const magnitude = (v) => Math.hypot(v.x, v.y, v.z);
const mixVector = (a, b, t) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

function limitVector(v, maximum) {
  const length = magnitude(v);
  const scale = length > maximum ? maximum / length : 1;
  return { x: v.x * scale, y: v.y * scale, z: v.z * scale };
}

// Normalized shortest-path interpolation is accurate at the 120 Hz step size.
function mixQuaternion(a, b, t) {
  const sign = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w < 0 ? -1 : 1;
  const q = {
    x: a.x * (1 - t) + b.x * t * sign,
    y: a.y * (1 - t) + b.y * t * sign,
    z: a.z * (1 - t) + b.z * t * sign,
    w: a.w * (1 - t) + b.w * t * sign,
  };
  const length = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

function attachmentOffset(q) {
  return {
    x: 2 * (q.x * q.y - q.w * q.z) * ATTACHMENT_HEIGHT,
    y: (1 - 2 * (q.x * q.x + q.z * q.z)) * ATTACHMENT_HEIGHT,
    z: 2 * (q.y * q.z + q.w * q.x) * ATTACHMENT_HEIGHT,
  };
}

/**
 * A self-contained Rapier lanyard. Coordinates are world units; step(dt) takes
 * seconds. Drag coordinates specify the card CENTER. Returned data is copied,
 * so callers may use it directly with Three.js without owning Rapier objects.
 */
export async function createLanyardPhysics({ reducedMotion = false } = {}) {
  // Share WASM initialization between instances, but allow retry after failure.
  initialization ??= RAPIER.init().catch((error) => {
    initialization = undefined;
    throw error;
  });
  await initialization;

  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = FIXED_DT;
  world.numSolverIterations = 12;
  // Soft joints need extra force convergence to hold their loaded rest length.
  world.integrationParameters.numInternalPgsIterations = 4;

  const anchor = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(ANCHOR.x, ANCHOR.y, ANCHOR.z),
  );
  const segments = [];
  let previousBody = anchor;

  for (let i = 0; i < SEGMENTS; i += 1) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, ANCHOR.y - LINK_LENGTH * (i + 1), 0)
        .setCanSleep(false)
        .setLinearDamping(reducedMotion ? 4 : 1.8)
        .setAngularDamping(2),
    );
    // The spheres supply mass/inertia. Internal collisions are disabled so a
    // folded strap cannot kick the thin card or fight its attachment joint.
    world.createCollider(
      RAPIER.ColliderDesc.ball(0.065).setMass(SEGMENT_MASS).setCollisionGroups(0),
      body,
    );
    // Rapier 0.21 exposes no rope-length setter. A spring supplies elastic give
    // while a parallel rope is a permanent, bounded stretch stop. Subtract the
    // static extension under this link's supported weight to preserve rest Y.
    const supportedMass = CARD_MASS + (SEGMENTS - i) * SEGMENT_MASS;
    world.createImpulseJoint(
      RAPIER.JointData.spring(
        LINK_LENGTH - supportedMass * GRAVITY / SPRING_STIFFNESS,
        SPRING_STIFFNESS, reducedMotion ? SPRING_DAMPING * 1.5 : SPRING_DAMPING,
        ZERO, ZERO,
      ), previousBody, body, true,
    );
    world.createImpulseJoint(
      RAPIER.JointData.rope(LINK_LENGTH + MAX_STRETCH / SEGMENTS, ZERO, ZERO),
      previousBody, body, true,
    );
    segments.push(body);
    previousBody = body;
  }

  const card = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(REST.x, REST.y, REST.z)
      .setRotation(REST_ROTATION)
      // Let the springs finish their slow recoil instead of sleeping off-rest.
      .setCanSleep(false)
      .setLinearDamping(reducedMotion ? 3.6 : 0.55)
      .setAngularDamping(reducedMotion ? 3.8 : 0.65)
      .setAdditionalSolverIterations(4),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(1.25, 1.775, 0.045)
      // A slightly asymmetric mass keeps the tilt under gravity, without a
      // rotation lock or a corrective torque that would resist a user's spin.
      .setMassProperties(
        CARD_MASS,
        { x: -ATTACHMENT_HEIGHT * Math.tan(REST_TILT), y: 0, z: 0 },
        {
          x: CARD_MASS * (3.55 ** 2 + 0.09 ** 2) / 12,
          y: CARD_MASS * (2.5 ** 2 + 0.09 ** 2) / 12,
          z: CARD_MASS * (2.5 ** 2 + 3.55 ** 2) / 12,
        },
        IDENTITY,
      )
      .setCollisionGroups(0),
    card,
  );
  world.createImpulseJoint(
    RAPIER.JointData.spherical(ZERO, { x: 0, y: ATTACHMENT_HEIGHT, z: 0 }),
    segments[SEGMENTS - 1], card, true,
  );

  const bodies = [...segments, card];
  let accumulator = 0;
  let dragging = false;
  let disposed = false;
  let dragTarget = copyVector(REST);
  let smoothedTarget = copyVector(REST);
  let spinGrace = 0;

  function snapshot() {
    return {
      position: copyVector(card.translation()),
      quaternion: { ...card.rotation() },
      rope: segments.map((body) => copyVector(body.translation())),
    };
  }

  let current = snapshot();
  let previous = current;

  function wake() {
    for (const body of bodies) body.wakeUp();
  }

  function clampDragTarget(target) {
    const offset = attachmentOffset(card.rotation());
    const center = {
      x: Math.max(-6.5, Math.min(6.5, target.x)),
      y: Math.max(REST.y - MAX_STRETCH - 0.22, Math.min(ANCHOR.y - 0.7, target.y)),
      z: Math.max(-4, Math.min(4, target.z)),
    };
    // A small target overshoot lets the drag spring tension the elastic strap.
    // Actual extension is bounded by the rope joints, not pointer distance.
    const reachable = limitVector({
      x: center.x + offset.x - ANCHOR.x,
      y: center.y + offset.y - ANCHOR.y,
      z: center.z + offset.z - ANCHOR.z,
    }, ROPE_LENGTH + MAX_STRETCH + 0.22);
    return {
      x: ANCHOR.x + reachable.x - offset.x,
      y: ANCHOR.y + reachable.y - offset.y,
      z: ANCHOR.z + reachable.z - offset.z,
    };
  }

  function capBodyVelocity(body, linearLimit, angularLimit) {
    const linear = body.linvel();
    const angular = body.angvel();
    if (magnitude(linear) > linearLimit) body.setLinvel(limitVector(linear, linearLimit), true);
    if (magnitude(angular) > angularLimit) body.setAngvel(limitVector(angular, angularLimit), true);
  }

  function strapStretch(position, rotation) {
    const offset = attachmentOffset(rotation);
    const attachment = {
      x: position.x + offset.x,
      y: position.y + offset.y,
      z: position.z + offset.z,
    };
    const radial = {
      x: attachment.x - ANCHOR.x,
      y: attachment.y - ANCHOR.y,
      z: attachment.z - ANCHOR.z,
    };
    const distance = magnitude(radial);
    const extension = Math.max(0, distance - ROPE_LENGTH);
    return { attachment, radial, distance, extension, tension: Math.min(1, extension / MAX_STRETCH) };
  }

  function substep() {
    // Rapier forces persist across steps; clear them before applying the spring.
    card.resetForces(false);
    card.resetTorques(false);
    spinGrace = Math.max(0, spinGrace - FIXED_DT);

    const stretch = strapStretch(card.translation(), card.rotation());
    if (stretch.extension > 0) {
      // Cubic resistance engages smoothly as the strap stretches. Pull at the
      // clip along the strap so lateral swing and free rotation remain physical.
      const force = PROGRESSIVE_STIFFNESS * Math.min(stretch.extension, MAX_STRETCH) * stretch.tension ** 2;
      const scale = -force / stretch.distance;
      card.addForceAtPoint({
        x: stretch.radial.x * scale,
        y: stretch.radial.y * scale,
        z: stretch.radial.z * scale,
      }, stretch.attachment, true);
    }

    if (dragging) {
      const target = clampDragTarget(dragTarget);
      smoothedTarget = mixVector(smoothedTarget, target, 1 - Math.exp(-18 * FIXED_DT));
      const position = card.translation();
      const velocity = card.linvel();
      // A taut strap already supports gravity. Only support the badge with the
      // hand when the strap is slack, avoiding an upward kick on pointer-down.
      const gravitySupport = GRAVITY * Math.max(0, Math.min(1, (ROPE_LENGTH - stretch.distance) / 0.25));
      const acceleration = limitVector({
        x: 115 * (smoothedTarget.x - position.x) - 21 * velocity.x,
        y: 115 * (smoothedTarget.y - position.y) - 21 * velocity.y + gravitySupport,
        z: 115 * (smoothedTarget.z - position.z) - 21 * velocity.z,
      }, 100);
      const mass = card.mass();
      card.addForce({ x: acceleration.x * mass, y: acceleration.y * mass, z: acceleration.z * mass }, true);
    } else if (spinGrace === 0 && !card.isSleeping()) {
      const velocity = card.linvel();
      const angular = card.angvel();
      if (magnitude(velocity) < 0.45 && magnitude(angular) < 1.2) {
        const q = card.rotation();
        const yaw = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
        const yawError = Math.atan2(Math.sin(yaw - REST_YAW), Math.cos(yaw - REST_YAW));
        // Only a quiet card feels the strap's weak torsional restoring force.
        // Explicit spins have several seconds to complete multiple revolutions.
        const torque = Math.max(-0.7, Math.min(0.7, -0.8 * yawError - 0.5 * angular.y));
        if (Math.abs(yawError) > 0.012 || Math.abs(angular.y) > 0.015) {
          card.addTorque({ x: 0, y: torque, z: 0 }, true);
        }
      }
    }

    for (const body of bodies) capBodyVelocity(body, 14, 14);
    world.step();
  }

  function getCardTransform() {
    const alpha = accumulator / FIXED_DT;
    return {
      position: mixVector(previous.position, current.position, alpha),
      quaternion: mixQuaternion(previous.quaternion, current.quaternion, alpha),
    };
  }

  function reset() {
    if (disposed) return;
    dragging = false;
    accumulator = 0;
    spinGrace = 0;
    dragTarget = copyVector(REST);
    smoothedTarget = copyVector(REST);
    bodies.forEach((body, i) => {
      body.setTranslation(i < SEGMENTS ? { x: 0, y: ANCHOR.y - LINK_LENGTH * (i + 1), z: 0 } : REST, true);
      body.setRotation(i < SEGMENTS ? IDENTITY : REST_ROTATION, true);
      body.setLinvel(ZERO, true);
      body.setAngvel(ZERO, true);
      body.resetForces(false);
      body.resetTorques(false);
    });
    current = snapshot();
    previous = current;
  }

  return {
    step(dt) {
      if (disposed || !Number.isFinite(dt) || dt <= 0) return;
      // Drop excess elapsed time after a background tab or a long render frame.
      accumulator = Math.min(accumulator + dt, FIXED_DT * MAX_SUBSTEPS);
      let steps = 0;
      while (accumulator + 1e-10 >= FIXED_DT && steps < MAX_SUBSTEPS) {
        previous = current;
        substep();
        current = snapshot();
        accumulator = Math.max(0, accumulator - FIXED_DT);
        steps += 1;
        if (!finiteVector(current.position) || !Object.values(current.quaternion).every(Number.isFinite)
          || !current.rope.every(finiteVector) || magnitude(current.position) > 30) {
          reset();
          break;
        }
      }
    },

    getCardTransform,

    // Normalized extra stretch (0 at rest/slack, 1 at the stretch stop), sampled
    // from the rendered transform so callers can use it for strap tautness.
    getTension() {
      const { position, quaternion } = getCardTransform();
      return strapStretch(position, quaternion).tension;
    },

    getRopePoints() {
      const alpha = accumulator / FIXED_DT;
      const { position, quaternion } = getCardTransform();
      const offset = attachmentOffset(quaternion);
      return [
        copyVector(ANCHOR),
        ...current.rope.slice(0, -1).map((point, i) => mixVector(previous.rope[i], point, alpha)),
        // Derive the final point from the rendered card so its clip never gaps.
        { x: position.x + offset.x, y: position.y + offset.y, z: position.z + offset.z },
      ];
    },

    startDrag(worldPosition) {
      if (disposed || !finiteVector(worldPosition)) return;
      dragging = true;
      spinGrace = 0;
      dragTarget = copyVector(worldPosition);
      smoothedTarget = copyVector(card.translation());
      wake();
    },

    dragTo(worldPosition) {
      if (disposed || !dragging || !finiteVector(worldPosition)) return;
      dragTarget = copyVector(worldPosition);
    },

    endDrag() {
      if (disposed || !dragging) return;
      dragging = false;
      card.resetForces(false);
      // Keep the simulated release momentum, bounded independently of pointer
      // event frequency. Cap the chain too so it cannot whip the card afterward.
      for (const body of bodies) capBodyVelocity(body, reducedMotion ? 2 : 5.5, reducedMotion ? 3 : 8);
      wake();
    },

    spin() {
      if (disposed || dragging || reducedMotion) return;
      spinGrace = 4;
      const angular = card.angvel();
      card.setAngvel({ x: angular.x, y: 9, z: angular.z }, true);
      wake();
    },

    reset,

    dispose() {
      if (disposed) return;
      dragging = false;
      disposed = true;
      world.free();
    },

    get isDragging() {
      return dragging;
    },
  };
}
