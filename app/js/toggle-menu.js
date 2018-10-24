function toggleMenu() {
  const menuBtn = document.querySelector('.menu-btn');
  const closeBtn = document.querySelector('.mobile-menu__close');
  const mobileMenu = document.querySelector('.mobile-menu');

  menuBtn.addEventListener('click', () => {
    mobileMenu.classList.add('mobile-menu--open');
  });

  closeBtn.addEventListener('click', () => {
    mobileMenu.classList.remove('mobile-menu--open');
  });
}

export default toggleMenu;
