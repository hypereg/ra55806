<?php
/** @var $router \App\Service\Router */

?>
<ul>
    <li><a href="<?= $router->generatePath('') ?>">Home</a></li>
    <li><a href="<?= $router->generatePath('post-index') ?>">Posts</a></li>
    <!-- Copilot. -->
    <li><a href="<?= $router->generatePath('comment-index') ?>">Comments</a></li>
</ul>
<?php
