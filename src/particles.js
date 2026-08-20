import * as THREE from "three";

let particles;
let particleSystem;

export function createParticles(scene) {

    const count = 1000;

    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {

        positions[i * 3] = (Math.random() - 0.5) * 20;
        positions[i * 3 + 1] = Math.random() * 8;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 20;

    }

    geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3)
    );

    const material = new THREE.PointsMaterial({

        color: 0xffffff,
        size: 0.05

    });

    particleSystem = new THREE.Points(
        geometry,
        material
    );

    particles = positions;

    scene.add(particleSystem);

}

export function updateParticles(volume){

    if(!particles) return;

    for(let i=0;i<particles.length;i+=3){

        particles[i+1]+=0.005+volume*0.0001;

        if(particles[i+1]>8){

            particles[i+1]=0;

        }

    }

    particleSystem.geometry.attributes.position.needsUpdate=true;

}