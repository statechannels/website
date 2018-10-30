import bodymovin from 'bodymovin';

// Graphic Objects
let graphic1 = {
  el: document.querySelector('.tech-content__graphics__item1'),
  state: 'active',
  animation: bodymovin.loadAnimation({
    container: document.querySelector('.tech-content__graphics__item1'),
    path: '../layer1.json',
    renderer: 'svg',
    autoplay: false,
    loop: false
  })
}

let graphic2 = {
  el: document.querySelector('.tech-content__graphics__item2'),
  state: 'inactive',
  animation: bodymovin.loadAnimation({
    container: document.querySelector('.tech-content__graphics__item2'),
    path: '../layer2.json',
    renderer: 'svg',
    autoplay: false,
    loop: false
  })
}

let graphic3 = {
  el: document.querySelector('.tech-content__graphics__item3'),
  state: 'inactive',
  animation: bodymovin.loadAnimation({
    container: document.querySelector('.tech-content__graphics__item3'),
    path: '../layer3.json',
    renderer: 'svg',
    autoplay: false,
    loop: false
  })
}

// Content Objects
let content1 = {
  el: document.querySelector('.tech-content__info__1'),
  state: 'initial'
}

let content2 = {
  el: document.querySelector('.tech-content__info__2'),
  state: 'initial'
}

let content3 = {
  el: document.querySelector('.tech-content__info__3'),
  state: 'initial'
}

function animateElements() {

  // Content Handler
  function handleContentChange(a, b, c) {
    if (a.state === 'initial') {
      a.el.classList.add('content-show');
      a.state = 'visible';
    } else if (a.state === 'hidden') {
      a.el.classList.replace('content-hide', 'content-show');
      a.state = 'visible';
    }

    if (b.state === 'visible') {
      b.el.classList.replace('content-show', 'content-hide');
      b.state = 'hidden';
    }

    if (c.state === 'visible') {
      c.el.classList.replace('content-show', 'content-hide');
      c.state = 'hidden';
    }
  }


  // Graphic Handler
  function handleGraphicChange(a, b, c) {
    graphic1.el.classList.remove('graphic1Load');

    if (a.state === 'inactive') {
      a.state = 'active';
      a.el.classList.add('active');
      // a.animation.play();
    }

    if (b.state === 'active') {
      b.state = 'inactive';
      b.el.classList.remove('active');
      // b.animation.stop();
    }

    if (c.state === 'active') {
      c.state = 'inactive';
      c.el.classList.remove('active');
      // c.animation.stop();
    }
  }


  // Set Initial animation state
  window.setTimeout(() => {
    handleContentChange(content1, content2, content3);
    // graphic1.animation.play();

    // Graphic 1 - Enter
    graphic1.el.addEventListener('mouseover', () => {
      handleContentChange(content1, content2, content3);
      handleGraphicChange(graphic1, graphic2, graphic3);
    });

    // Graphic 2 - Enter
    graphic2.el.addEventListener('mouseover', () => {
      handleContentChange(content2, content1, content3);
      handleGraphicChange(graphic2, graphic1, graphic3);
    });

    // Graphic 3 - Enter
    graphic3.el.addEventListener('mouseover', () => {
      handleContentChange(content3, content1, content2);
      handleGraphicChange(graphic3, graphic1, graphic2);
    });
  }, 4000);
}

export default animateElements;
