// Used ChatGPT & Slick to create the carousel to make life easy
$(document).ready(function(){
    $('.carousel').slick({
        // dots: true,
        infinite: true,
        speed: 400,
        slidesToShow: 1,
        adaptiveHeight: true
    });
});