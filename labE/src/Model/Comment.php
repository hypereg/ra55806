<?php
// Copilot.
namespace App\Model;

use App\Service\Config;

class Comment
{
    private ?int $id = null;
    private ?string $author = null;
    private ?string $content = null;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function setId(?int $id): Comment
    {
        $this->id = $id;

        return $this;
    }

    public function getAuthor(): ?string
    {
        return $this->author;
    }

    public function setAuthor(?string $author): Comment
    {
        $this->author = $author;

        return $this;
    }

    public function getContent(): ?string
    {
        return $this->content;
    }

    public function setContent(?string $content): Comment
    {
        $this->content = $content;

        return $this;
    }

    public static function fromArray($array): Comment
    {
        $comment = new self();
        $comment->fill($array);

        return $comment;
    }

    public function fill($array): Comment
    {
        if (isset($array['id']) && ! $this->getId()) {
            $this->setId($array['id']);
        }
        if (isset($array['author'])) {
            $this->setAuthor($array['author']);
        }
        if (isset($array['content'])) {
            $this->setContent($array['content']);
        }

        return $this;
    }

    public static function findAll(): array
    {
        $pdo = new \PDO(Config::get('db_dsn'), Config::get('db_user'), Config::get('db_pass'));
        $statement = $pdo->prepare('SELECT * FROM comment');
        $statement->execute();

        $comments = [];
        foreach ($statement->fetchAll(\PDO::FETCH_ASSOC) as $commentArray) {
            $comments[] = self::fromArray($commentArray);
        }

        return $comments;
    }

    public static function find($id): ?Comment
    {
        $pdo = new \PDO(Config::get('db_dsn'), Config::get('db_user'), Config::get('db_pass'));
        $statement = $pdo->prepare('SELECT * FROM comment WHERE id = :id');
        $statement->execute(['id' => $id]);

        $commentArray = $statement->fetch(\PDO::FETCH_ASSOC);
        if (! $commentArray) {
            return null;
        }

        return self::fromArray($commentArray);
    }

    public function save(): void
    {
        $pdo = new \PDO(Config::get('db_dsn'), Config::get('db_user'), Config::get('db_pass'));
        if (! $this->getId()) {
            $statement = $pdo->prepare(
                'INSERT INTO comment (author, content) VALUES (:author, :content)'
            );
            $statement->execute([
                'author' => $this->getAuthor(),
                'content' => $this->getContent(),
            ]);
            $this->setId($pdo->lastInsertId());
        } else {
            $statement = $pdo->prepare(
                'UPDATE comment SET author = :author, content = :content WHERE id = :id'
            );
            $statement->execute([
                'author' => $this->getAuthor(),
                'content' => $this->getContent(),
                'id' => $this->getId(),
            ]);
        }
    }

    public function delete(): void
    {
        $pdo = new \PDO(Config::get('db_dsn'), Config::get('db_user'), Config::get('db_pass'));
        $statement = $pdo->prepare('DELETE FROM comment WHERE id = :id');
        $statement->execute(['id' => $this->getId()]);

        $this->setId(null);
        $this->setAuthor(null);
        $this->setContent(null);
    }
}
