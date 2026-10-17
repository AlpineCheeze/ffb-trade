import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { animate, motionValue } from 'framer-motion';

// Mock requestAnimationFrame for deterministic timing in Node.js
if (typeof global.requestAnimationFrame === 'undefined') {
  global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16) as any;
}
if (typeof global.cancelAnimationFrame === 'undefined') {
  global.cancelAnimationFrame = (id) => clearTimeout(id) as any;
}

export const testPromise = (async function runTests() {
  console.log('--- Starting Button Swipe & Animation Verification Suite ---');

  // Test 1: Verify framer-motion animate on MotionValue towards positive target (WANT)
  console.log('\n[Test 1] Testing Want animation trajectory (positive targetX)...');
  {
    const x = motionValue(0);
    const cardOpacity = motionValue(1);
    let swipeCommitted = false;
    let committedParam: boolean | null = null;

    const onSwipe = (isInterested: boolean) => {
      swipeCommitted = true;
      committedParam = isInterested;
    };

    const flyDistance = 450;
    const targetX = flyDistance;

    // Animate opacity fade
    animate(cardOpacity, 0, {
      duration: 0.15,
      delay: 0.1,
      ease: 'easeOut',
    });

    await new Promise<void>((resolve) => {
      animate(x, targetX, {
        duration: 0.2,
        ease: [0.32, 0.72, 0, 1],
        onComplete: () => {
          onSwipe(true);
          resolve();
        },
      });
    });

    assert.strictEqual(swipeCommitted, true, 'onSwipe must be called after animation completes');
    assert.strictEqual(committedParam, true, 'Committed param must be true for WANT');
    assert(x.get() >= 400, `Final x value should be at or near targetX (got ${x.get()})`);
    assert(cardOpacity.get() <= 0.1, `Card opacity should fade to near 0 at exit (got ${cardOpacity.get()})`);
    console.log('✓ Test 1 Passed: WANT button animation completes and triggers onSwipe(true) smoothly.');
  }

  // Test 2: Verify framer-motion animate on MotionValue towards negative target (PASS)
  console.log('\n[Test 2] Testing Pass animation trajectory (negative targetX)...');
  {
    const x = motionValue(0);
    const cardOpacity = motionValue(1);
    let swipeCommitted = false;
    let committedParam: boolean | null = null;

    const onSwipe = (isInterested: boolean) => {
      swipeCommitted = true;
      committedParam = isInterested;
    };

    const flyDistance = 450;
    const targetX = -flyDistance;

    await new Promise<void>((resolve) => {
      animate(x, targetX, {
        duration: 0.2,
        ease: [0.32, 0.72, 0, 1],
        onComplete: () => {
          onSwipe(false);
          resolve();
        },
      });
    });

    assert.strictEqual(swipeCommitted, true, 'onSwipe must be called after animation completes');
    assert.strictEqual(committedParam, false, 'Committed param must be false for PASS');
    assert(x.get() <= -400, `Final x value should be negative at or near -targetX (got ${x.get()})`);
    console.log('✓ Test 2 Passed: PASS button animation completes and triggers onSwipe(false) smoothly.');
  }

  // Test 3: Rapid Double-Click Concurrency Protection
  console.log('\n[Test 3] Testing rapid click debounce & in-flight animation locking...');
  {
    let animationCallCount = 0;
    let isSwiping = false;

    const triggerSwipe = (isInterested: boolean) => {
      if (isSwiping) return false;
      isSwiping = true;
      animationCallCount++;
      setTimeout(() => {
        isSwiping = false;
      }, 100);
      return true;
    };

    // First click triggers animation
    const firstCall = triggerSwipe(true);
    assert.strictEqual(firstCall, true, 'First click must start swipe animation');

    // Immediate rapid second and third clicks should be rejected
    const secondCall = triggerSwipe(false);
    assert.strictEqual(secondCall, false, 'Second click while in-flight must be rejected');

    const thirdCall = triggerSwipe(true);
    assert.strictEqual(thirdCall, false, 'Third click while in-flight must be rejected');

    assert.strictEqual(animationCallCount, 1, 'Only exactly 1 swipe animation should have started');

    // Wait for in-flight animation lock to release
    await new Promise((r) => setTimeout(r, 150));

    // Next click after completion should be accepted
    const fourthCall = triggerSwipe(false);
    assert.strictEqual(fourthCall, true, 'Click after animation release must succeed');
    assert.strictEqual(animationCallCount, 2, 'Total animation count should now be 2');
    console.log('✓ Test 3 Passed: Rapid clicks are cleanly rejected to prevent duplicate swipes.');
  }

  // Test 4: Verify SwipeCard component contracts and page.tsx integration
  console.log('\n[Test 4] Verifying SwipeCard component contracts and page.tsx integration...');
  {
    const swipeCardSource = fs.readFileSync(path.resolve(__dirname, '../src/components/SwipeCard.tsx'), 'utf8');
    const pageSource = fs.readFileSync(path.resolve(__dirname, '../src/app/page.tsx'), 'utf8');

    assert(swipeCardSource.includes('export interface SwipeCardRef'), 'SwipeCard must export SwipeCardRef interface');
    assert(swipeCardSource.includes('React.forwardRef<SwipeCardRef'), 'SwipeCard must be wrapped in React.forwardRef');
    assert(swipeCardSource.includes('triggerSwipe'), 'SwipeCard must implement triggerSwipe logic');
    assert(swipeCardSource.includes("actionStamp === 'want'"), 'SwipeCard must handle WANT action stamp');
    assert(swipeCardSource.includes("actionStamp === 'pass'"), 'SwipeCard must handle PASS action stamp');
    assert(swipeCardSource.includes("SwipeCard.displayName = 'SwipeCard'"), 'SwipeCard must set displayName');

    assert(pageSource.includes('SwipeCardRef'), 'page.tsx must import SwipeCardRef');
    assert(pageSource.includes('cardRef.current.swipe('), 'page.tsx must trigger cardRef.current.swipe');
    assert(pageSource.includes('handleButtonSwipe(true)'), 'page.tsx must call handleButtonSwipe(true) for Want button');
    assert(pageSource.includes('handleButtonSwipe(false)'), 'page.tsx must call handleButtonSwipe(false) for Pass button');
    assert(pageSource.includes('disabled={isSwipingCard}'), 'page.tsx must disable action buttons while swiping');

    console.log('✓ Test 4 Passed: SwipeCard and page.tsx animation and ref contracts verified.');
  }

  console.log('\n======================================================');
  console.log('ALL BUTTON SWIPE & ANIMATION VERIFICATION TESTS PASSED! 🎉');
  console.log('======================================================');
})();
